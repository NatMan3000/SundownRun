import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useBeforePhysicsStep } from '@react-three/rapier'
import { CONFIG } from '../core/config'
import { propsSignal } from '../core/propsSignal'
import { mulberry32 } from '../core/random'
import { getTerrainHeight, roadDistance } from '../core/terrain'
import { emitTrick } from '../core/tricks'
import { vehicleSignals } from '../vehicle/vehicleSignals'
import type { BodyQuery } from './treeSmash'

// ============================================================
//  CRASH PROPS - things that burst for points
// ------------------------------------------------------------
//  Three families of smashables scattered at RANDOM open spots, re-rolled on
//  every reset/restart (vehicleSignals.resetTick is the round number AND the
//  RNG seed - a round is deterministic but no two rounds match):
//
//    hay pyramids   - burst up and away, tumbling      - HAY DAY +15
//    crate towers   - fly apart hard and high          - DEMOLITION +20
//    barrel rings   - scatter LOW and fast, rolling    - BARREL BLAST +25
//
//  No colliders anywhere: props never hard-stop the car, so hitting one is
//  pure reward. Perf: one instanced mesh per family (fixed instance counts),
//  matrices rewritten only during bursts and re-scatters; the hit test is one
//  cheap distance reject per intact cluster per physics step, zero alloc.
// ============================================================

const MIN_KMH = 12 //  slower than this is a nudge, not a crash
const FLY_S = 2.6 //   seconds a burst piece lives before it has faded out
const PLACE_R_MAX = 580
const ROAD_CLEAR = 24

interface PropSpec {
  label: string
  points: number
  clusters: number
  /** piece offsets within an intact cluster, local (x, y, z) */
  formation: ReadonlyArray<readonly [number, number, number]>
  geometry: () => THREE.BufferGeometry
  color: string
  hitR: number
  /** burst character: kick along travel, straight-up lift, tumble rate */
  kick: number
  lift: number
  tumble: number
  /** rest height of a settled piece over the ground */
  restY: number
}

const CRATE = 0.55
const SPECS: readonly PropSpec[] = [
  {
    label: 'HAY DAY',
    points: 15,
    clusters: 8,
    formation: [
      [-1.6, 0.55, 0],
      [0, 0.55, 0],
      [1.6, 0.55, 0],
      [-0.8, 1.59, 0],
      [0.8, 1.59, 0],
      [0, 2.63, 0],
    ],
    geometry: () => new THREE.BoxGeometry(1.5, 1.1, 1.1),
    color: '#D9B45A',
    hitR: 3.2,
    kick: 0.45,
    lift: 3.5,
    tumble: 1.0,
    restY: 0.33,
  },
  {
    label: 'DEMOLITION',
    points: 20,
    clusters: 6,
    formation: [
      // a 2-wide, 3-high crate tower - taller than it is stable, as all good towers are
      [-CRATE, CRATE, 0],
      [CRATE, CRATE, 0],
      [-CRATE, CRATE * 3, 0],
      [CRATE, CRATE * 3, 0],
      [-CRATE, CRATE * 5, 0],
      [CRATE, CRATE * 5, 0],
    ],
    geometry: () => new THREE.BoxGeometry(CRATE * 2, CRATE * 2, CRATE * 2),
    color: '#8A6A48',
    hitR: 2.6,
    kick: 0.6,
    lift: 5.5,
    tumble: 1.6,
    restY: 0.3,
  },
  {
    label: 'BARREL BLAST',
    points: 25,
    clusters: 6,
    formation: [
      // five standing barrels in a loose ring
      [0, 0.65, 0],
      [1.15, 0.65, 0.3],
      [-1.05, 0.65, 0.45],
      [0.35, 0.65, -1.1],
      [-0.5, 0.65, 1.15],
    ],
    geometry: () => new THREE.CylinderGeometry(0.45, 0.45, 1.3, 10),
    color: '#A8552E',
    hitR: 2.8,
    kick: 0.75, // barrels fly FLAT and fast - they scatter and roll rather than soar
    lift: 1.6,
    tumble: 2.2,
    restY: 0.45,
  },
]

const MAX_PIECES = SPECS.reduce((n, s) => n + s.clusters * s.formation.length, 0)

interface Cluster {
  x: number
  y: number
  z: number
  alive: boolean
}

// flight state for every piece in the world, allocated once
const flyPos = new Float32Array(MAX_PIECES * 3)
const flyVel = new Float32Array(MAX_PIECES * 3)
const flySpin = new Float32Array(MAX_PIECES * 3)
const flyAge = new Float32Array(MAX_PIECES).fill(-1) // <0 = not flying

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _s = new THREE.Vector3(1, 1, 1)
const _p = new THREE.Vector3()

/** Scatter every family's clusters for a round. One RNG stream keeps them apart. */
function scatterAll(round: number): Cluster[][] {
  const rng = mulberry32(0x8a1e5 ^ (round * 2654435761))
  const placed: Cluster[] = []
  return SPECS.map((spec) => {
    const out: Cluster[] = []
    for (let attempt = 0; attempt < 500 && out.length < spec.clusters; attempt++) {
      const x = (rng() * 2 - 1) * PLACE_R_MAX
      const z = (rng() * 2 - 1) * PLACE_R_MAX
      if (Math.hypot(x, z) > PLACE_R_MAX) continue
      if (roadDistance(x, z, ROAD_CLEAR + 1) < ROAD_CLEAR) continue
      const e = 3
      const gx = getTerrainHeight(x + e, z) - getTerrainHeight(x - e, z)
      const gz = getTerrainHeight(x, z + e) - getTerrainHeight(x, z - e)
      if (Math.hypot(gx, gz) / (2 * e) > 0.28) continue
      let clash = false
      for (const s of placed) if (Math.hypot(s.x - x, s.z - z) < 40) clash = true
      if (clash) continue
      const c = { x, y: getTerrainHeight(x, z), z, alive: true }
      out.push(c)
      placed.push(c)
    }
    return out
  })
}

export function CrashProps() {
  if (!CONFIG.tricks) return null
  return <CrashPropsInner />
}

function CrashPropsInner() {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([])
  const clustersRef = useRef<Cluster[][]>(scatterAll(0))
  const roundRef = useRef(0)
  const dirtyRef = useRef(true)

  const geometries = useMemo(() => SPECS.map((s) => s.geometry()), [])
  const materials = useMemo(
    () => SPECS.map((s) => new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.92, metalness: 0 })),
    []
  )

  // base index of each family's pieces inside the shared flight arrays
  const bases = useMemo(() => {
    const b: number[] = []
    let n = 0
    for (const s of SPECS) {
      b.push(n)
      n += s.clusters * s.formation.length
    }
    return b
  }, [])

  /** Burst cluster (f, i): kill it and send its pieces flying, shaped by the
   *  smashing car's velocity. Shared by the local hit test and remote pop
   *  events - only the local path scores points. */
  function burst(f: number, i: number, vx: number, vz: number, speed: number): boolean {
    const spec = SPECS[f]
    const c = clustersRef.current[f]?.[i]
    if (!c || !c.alive) return false
    c.alive = false
    const inv = 1 / (speed || 1)
    const nP = spec.formation.length
    for (let b = 0; b < nP; b++) {
      const k = bases[f] + i * nP + b
      flyAge[k] = 0
      flyPos[k * 3] = c.x + spec.formation[b][0]
      flyPos[k * 3 + 1] = c.y + spec.formation[b][1]
      flyPos[k * 3 + 2] = c.z + spec.formation[b][2]
      const fan = (b / Math.max(1, nP - 1) - 0.5) * 0.9
      const co = Math.cos(fan)
      const sn = Math.sin(fan)
      const dx = (vx * co - vz * sn) * inv
      const dz = (vx * sn + vz * co) * inv
      const kick = 4 + speed * spec.kick + b * 0.6
      flyVel[k * 3] = dx * kick
      flyVel[k * 3 + 1] = spec.lift + b * 0.7 + speed * 0.12
      flyVel[k * 3 + 2] = dz * kick
      flySpin[k * 3] = (b % 2 ? 1 : -1) * (2 + b) * spec.tumble
      flySpin[k * 3 + 1] = 1.5 * (b - nP / 2) * spec.tumble
      flySpin[k * 3 + 2] = ((b % 3) - 1) * spec.tumble
    }
    dirtyRef.current = true
    return true
  }

  // ---- physics-step side: find the car, pop clusters it hits ----
  useBeforePhysicsStep((w: BodyQuery) => {
    let car: any = null
    w.forEachRigidBody((b: any) => {
      if (!car && b.isDynamic() && b.mass() > 200) car = b
    })
    if (!car) return
    const p = car.translation()
    const v = car.linvel()
    const speed = Math.hypot(v.x, v.z)
    if (speed * 3.6 < MIN_KMH) return

    for (let f = 0; f < SPECS.length; f++) {
      const spec = SPECS[f]
      const clusters = clustersRef.current[f]
      for (let i = 0; i < clusters.length; i++) {
        const c = clusters[i]
        if (!c.alive) continue
        if (Math.abs(p.x - c.x) > spec.hitR || Math.abs(p.z - c.z) > spec.hitR) continue
        if (p.y - c.y > 3.4) continue // flew clean over it - no burst
        if (!burst(f, i, v.x, v.z, speed)) continue
        emitTrick(spec.label, spec.points, 1)
        propsSignal.onLocalPop?.({ f, i, vx: v.x, vz: v.z, speed })
      }
    }
  })

  // ---- render side: rescatter on round change, animate bursts ----
  useFrame((_, dt) => {
    // Single-player: every reset is a new round (fresh scatter). Multiplayer:
    // rounds are shared and dealt by race starts (core/propsSignal.ts) -
    // local resets must NOT re-roll a layout the other machines still have.
    const round = propsSignal.shared ? propsSignal.round : vehicleSignals.resetTick
    if (round !== roundRef.current) {
      roundRef.current = round
      clustersRef.current = scatterAll(round)
      flyAge.fill(-1)
      dirtyRef.current = true
    }

    // Remote pops: someone else smashed these clusters on their machine.
    // Burst here too (no points - they scored, we spectate).
    while (propsSignal.pending.length > 0) {
      const ev = propsSignal.pending.pop()!
      burst(ev.f, ev.i, ev.vx, ev.vz, ev.speed)
    }

    let animating = false
    for (let f = 0; f < SPECS.length; f++) {
      const mesh = meshRefs.current[f]
      if (!mesh) continue
      const spec = SPECS[f]
      const clusters = clustersRef.current[f]
      const nP = spec.formation.length
      let wrote = false

      for (let i = 0; i < spec.clusters; i++) {
        const c = clusters[i]
        for (let b = 0; b < nP; b++) {
          const k = bases[f] + i * nP + b
          const local = i * nP + b
          if (c && c.alive) {
            if (dirtyRef.current) {
              _e.set(0, ((i * 37 + b * 53) % 7) * 0.13, 0)
              _q.setFromEuler(_e)
              _p.set(c.x + spec.formation[b][0], c.y + spec.formation[b][1], c.z + spec.formation[b][2])
              _m.compose(_p, _q, _s.set(1, 1, 1))
              mesh.setMatrixAt(local, _m)
              wrote = true
            }
            continue
          }
          const age = flyAge[k]
          if (age < 0 || age > FLY_S) {
            if (dirtyRef.current) {
              _m.makeScale(0, 0, 0) // hidden: burst finished, or no cluster this round
              mesh.setMatrixAt(local, _m)
              wrote = true
            }
            continue
          }
          animating = true
          wrote = true
          flyAge[k] = age + dt
          flyVel[k * 3 + 1] -= 18 * dt // heavy-prop gravity - reads better than 9.8
          flyPos[k * 3] += flyVel[k * 3] * dt
          flyPos[k * 3 + 1] += flyVel[k * 3 + 1] * dt
          flyPos[k * 3 + 2] += flyVel[k * 3 + 2] * dt
          const ground = getTerrainHeight(flyPos[k * 3], flyPos[k * 3 + 2]) + spec.restY
          if (flyPos[k * 3 + 1] < ground) {
            flyPos[k * 3 + 1] = ground
            flyVel[k * 3] *= 0.6
            flyVel[k * 3 + 1] *= -0.3 // one soft bounce, then it stays down
            flyVel[k * 3 + 2] *= 0.6
          }
          const t = age / FLY_S
          const shrink = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1
          _e.set(flySpin[k * 3] * age, flySpin[k * 3 + 1] * age, flySpin[k * 3 + 2] * age)
          _q.setFromEuler(_e)
          _p.set(flyPos[k * 3], flyPos[k * 3 + 1], flyPos[k * 3 + 2])
          _m.compose(_p, _q, _s.set(shrink, shrink, shrink))
          mesh.setMatrixAt(local, _m)
        }
      }
      if (wrote) mesh.instanceMatrix.needsUpdate = true
    }
    dirtyRef.current = animating
  })

  return (
    <>
      {SPECS.map((s, f) => (
        <instancedMesh
          key={s.label}
          ref={(m) => {
            meshRefs.current[f] = m
          }}
          args={[geometries[f], materials[f], s.clusters * s.formation.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </>
  )
}
