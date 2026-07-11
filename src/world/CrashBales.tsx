import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useBeforePhysicsStep } from '@react-three/rapier'
import { CONFIG } from '../core/config'
import { mulberry32 } from '../core/random'
import { getTerrainHeight, roadDistance } from '../core/terrain'
import { emitTrick } from '../core/tricks'
import { vehicleSignals } from '../vehicle/vehicleSignals'
import type { BodyQuery } from './treeSmash'

// ============================================================
//  CRASH BALES - hay stacks that explode for points
// ------------------------------------------------------------
//  A handful of hay-bale pyramids scattered at RANDOM open spots, re-rolled on
//  every reset/restart (vehicleSignals.resetTick is the round number AND the
//  RNG seed, so a round is deterministic but no two rounds match). Drive into
//  one and it bursts - bales fling along your direction of travel, tumble,
//  settle and fade - and the stack pays SMASH points. No colliders at all:
//  hay never hard-stops the car, so hitting one is pure reward.
//
//  Perf: ONE instanced mesh sized once (STACKS x BALES_PER). Matrices move only
//  while bales fly (a burst is an event, not a steady state); the proximity
//  check is one distance test per intact stack per physics step, zero alloc.
// ============================================================

const STACKS = 8
const SMASH_PTS = 15
const SMASH_LABEL = 'HAY DAY'
/** pyramid: 3 on the ground, 2 across them, 1 on top */
const PER_STACK = 6
const BALE = { hx: 0.75, hy: 0.55, hz: 0.55 } // a fat round-ish bale as a box
const HIT_R = 3.2 //     car-to-stack-centre distance that pops it
const MIN_KMH = 12 //    slower than this is a nudge, not a crash
const FLY_S = 2.6 //     seconds a burst bale lives before it has faded out

/** Placement: anywhere open in the valley - off the road, off the steep stuff. */
const PLACE_R_MAX = 580
const ROAD_CLEAR = 24

interface Stack {
  x: number
  y: number
  z: number
  alive: boolean
}

// per-bale flight state, allocated once at module scope
const flyPos = new Float32Array(STACKS * PER_STACK * 3)
const flyVel = new Float32Array(STACKS * PER_STACK * 3)
const flySpin = new Float32Array(STACKS * PER_STACK * 3)
const flyAge = new Float32Array(STACKS * PER_STACK).fill(-1) // <0 = not flying

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _s = new THREE.Vector3(1, 1, 1)
const _p = new THREE.Vector3()

/** bale offsets within a pyramid, local to the stack centre */
const PYRAMID: ReadonlyArray<readonly [number, number, number]> = [
  [-1.6, BALE.hy, 0],
  [0, BALE.hy, 0],
  [1.6, BALE.hy, 0],
  [-0.8, BALE.hy * 3 - 0.06, 0],
  [0.8, BALE.hy * 3 - 0.06, 0],
  [0, BALE.hy * 5 - 0.12, 0],
]

function scatterStacks(round: number): Stack[] {
  const rng = mulberry32(0x8a1e5 ^ (round * 2654435761))
  const out: Stack[] = []
  for (let attempt = 0; attempt < 400 && out.length < STACKS; attempt++) {
    const x = (rng() * 2 - 1) * PLACE_R_MAX
    const z = (rng() * 2 - 1) * PLACE_R_MAX
    if (Math.hypot(x, z) > PLACE_R_MAX) continue
    if (roadDistance(x, z, ROAD_CLEAR + 1) < ROAD_CLEAR) continue
    // flat enough that a pyramid doesn't float a corner
    const e = 3
    const gx = getTerrainHeight(x + e, z) - getTerrainHeight(x - e, z)
    const gz = getTerrainHeight(x, z + e) - getTerrainHeight(x, z - e)
    if (Math.hypot(gx, gz) / (2 * e) > 0.28) continue
    // not on top of another stack
    let clash = false
    for (const s of out) if (Math.hypot(s.x - x, s.z - z) < 40) clash = true
    if (clash) continue
    out.push({ x, y: getTerrainHeight(x, z), z, alive: true })
  }
  return out
}

export function CrashBales() {
  if (!CONFIG.tricks) return null
  return <CrashBalesInner />
}

function CrashBalesInner() {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const stacksRef = useRef<Stack[]>(scatterStacks(0))
  const roundRef = useRef(0)
  const dirtyRef = useRef(true)
  const carRef = useRef<{ x: number; z: number; vx: number; vz: number }>({ x: 0, z: 0, vx: 0, vz: 0 })

  const geometry = useMemo(() => new THREE.BoxGeometry(BALE.hx * 2, BALE.hy * 2, BALE.hz * 2), [])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#D9B45A', roughness: 0.95, metalness: 0 }),
    []
  )

  // ---- physics-step side: read the car, pop stacks it hits ----
  useBeforePhysicsStep((w: BodyQuery) => {
    // find the chassis (same guard as treeSmash - the only heavy dynamic body)
    let car: any = null
    w.forEachRigidBody((b: any) => {
      if (!car && b.isDynamic() && b.mass() > 200) car = b
    })
    if (!car) return
    const p = car.translation()
    const v = car.linvel()
    carRef.current.x = p.x
    carRef.current.z = p.z
    carRef.current.vx = v.x
    carRef.current.vz = v.z
    const speed = Math.hypot(v.x, v.z)
    if (speed * 3.6 < MIN_KMH) return

    const stacks = stacksRef.current
    for (let i = 0; i < stacks.length; i++) {
      const s = stacks[i]
      if (!s.alive) continue
      if (Math.abs(p.x - s.x) > HIT_R || Math.abs(p.z - s.z) > HIT_R) continue
      if (p.y - s.y > 3.4) continue // flew clean over the pyramid - no burst
      s.alive = false
      // launch its bales: mostly along the car's travel, fanned and lifted
      const inv = 1 / (speed || 1)
      for (let b = 0; b < PER_STACK; b++) {
        const k = i * PER_STACK + b
        flyAge[k] = 0
        flyPos[k * 3] = s.x + PYRAMID[b][0]
        flyPos[k * 3 + 1] = s.y + PYRAMID[b][1]
        flyPos[k * 3 + 2] = s.z + PYRAMID[b][2]
        const fan = (b / (PER_STACK - 1) - 0.5) * 0.9
        const c = Math.cos(fan)
        const sn = Math.sin(fan)
        const dx = (v.x * c - v.z * sn) * inv
        const dz = (v.x * sn + v.z * c) * inv
        const kick = 4 + speed * 0.45 + b * 0.6
        flyVel[k * 3] = dx * kick
        flyVel[k * 3 + 1] = 3.5 + b * 0.8 + speed * 0.12
        flyVel[k * 3 + 2] = dz * kick
        flySpin[k * 3] = (b % 2 ? 1 : -1) * (2 + b)
        flySpin[k * 3 + 1] = 1.5 * (b - 2.5)
        flySpin[k * 3 + 2] = (b % 3) - 1
      }
      emitTrick(SMASH_LABEL, SMASH_PTS, 1)
      dirtyRef.current = true
    }
  })

  // ---- render side: rescatter on reset, animate bursts ----
  useFrame((_, dt) => {
    const mesh = meshRef.current
    if (!mesh) return

    if (vehicleSignals.resetTick !== roundRef.current) {
      roundRef.current = vehicleSignals.resetTick
      stacksRef.current = scatterStacks(roundRef.current)
      flyAge.fill(-1)
      dirtyRef.current = true
    }

    let animating = false
    const stacks = stacksRef.current
    for (let i = 0; i < STACKS; i++) {
      const s = stacks[i]
      for (let b = 0; b < PER_STACK; b++) {
        const k = i * PER_STACK + b
        if (s && s.alive) {
          // intact pyramid - only rewritten when dirty
          if (dirtyRef.current) {
            _e.set(0, (i * 37 + b * 53) % 7 * 0.13, 0)
            _q.setFromEuler(_e)
            _p.set(s.x + PYRAMID[b][0], s.y + PYRAMID[b][1], s.z + PYRAMID[b][2])
            _m.compose(_p, _q, _s.set(1, 1, 1))
            mesh.setMatrixAt(k, _m)
          }
          continue
        }
        const age = flyAge[k]
        if (age < 0 || age > FLY_S) {
          if (dirtyRef.current) {
            _m.makeScale(0, 0, 0) // hidden: burst finished, or no stack this round
            mesh.setMatrixAt(k, _m)
          }
          continue
        }
        // flying bale: integrate, tumble, shrink out at the end of its life
        animating = true
        flyAge[k] = age + dt
        flyVel[k * 3 + 1] -= 18 * dt // heavy-hay gravity - reads better than 9.8
        flyPos[k * 3] += flyVel[k * 3] * dt
        flyPos[k * 3 + 1] += flyVel[k * 3 + 1] * dt
        flyPos[k * 3 + 2] += flyVel[k * 3 + 2] * dt
        const ground = getTerrainHeight(flyPos[k * 3], flyPos[k * 3 + 2]) + BALE.hy * 0.6
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
        mesh.setMatrixAt(k, _m)
      }
    }

    if (dirtyRef.current || animating) {
      mesh.instanceMatrix.needsUpdate = true
      dirtyRef.current = animating // keep writing while a burst is in the air
    }
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, STACKS * PER_STACK]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}
