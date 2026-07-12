// ============================================================
//  SUN SHARDS - the reason to go looking
// ------------------------------------------------------------
//  Eleven warm crystals, and a SHARD HUNT: every reset ("round") deals
//  ten of them to fresh random spots - six over the road, one high over
//  a crest jump, one high over a geyser (ride the blast up to it), two
//  hidden out in the open country. The eleventh never moves: it hangs
//  above the cinder cone's crater, and the geyser inside the crater is
//  the elevator (Nathan + Josh's design).
//
//  The HUNT CLOCK starts on the round's first pickup and stops on the
//  last; the best time persists (core/store.ts). A reset deals a new
//  round: shards re-scatter, the found count and clock start over.
//
//  Layouts are seeded by the round number (deterministic per round, no
//  Math.random) - same discipline as CrashProps.
//
//  Two InstancedMeshes (core + additive halo), one useFrame, zero per-frame
//  allocation. Pickup is a squared-distance test against telemetry.carPosition.
// ============================================================

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { telemetry } from '../core/telemetry'
import { useGameStore } from '../core/store'
import { mulberry32 } from '../core/random'
import {
  JUMPS,
  ROAD_LENGTH,
  getTerrainHeight,
  nearestRoadPoint,
  roadDistance,
  roadSpline,
} from '../core/terrain'
import { vehicleSignals } from '../vehicle/vehicleSignals'
import { VENTS } from './Geysers'
import * as audio from '../audio/AudioEngine'

/** Pickup sphere around the car's centre of mass, metres. */
const PICKUP_RADIUS = 3.5
const PICKUP_R2 = PICKUP_RADIUS * PICKUP_RADIUS

/**
 * Air shard height above the road, metres. Deliberately just out of reach: the
 * car's body rides 0.54m up, so a slow pass along the centre line comes 3.82m
 * close and the 3.5m sphere misses it. Measured in-game: 56km/h over the crest
 * leaves it sitting there, ~150km/h+ takes it. It is a speed reward, not a
 * strict airborne check - suspension unload over the crest counts.
 */
const AIR_HEIGHT = 4.3
/** Metres past the crest, where the car is highest over the drop-away. */
const AIR_LEAD = 34

const POP_SECONDS = 0.25

// ---------- placement ----------

const _p = new THREE.Vector3()
const _tan = new THREE.Vector3()

/** metres along the circuit -> spline parameter */
const along = (m: number) => m / ROAD_LENGTH

/** Wrap into [0,1) - the road is a closed loop. */
const wrap = (t: number) => ((t % 1) + 1) % 1

/** Left-hand normal of the road in the xz plane, written into (outX, outZ). */
function lateralOffset(t: number, lateral: number): [number, number] {
  roadSpline.getTangentAt(wrap(t), _tan)
  let nx = -_tan.z
  let nz = _tan.x
  const len = Math.hypot(nx, nz) || 1
  nx /= len
  nz /= len
  return [nx * lateral, nz * lateral]
}

/** Hovering above the road surface. */
function overRoad(t: number, lateral: number, height: number): THREE.Vector3 {
  roadSpline.getPointAt(wrap(t), _p)
  const [ox, oz] = lateralOffset(t, lateral)
  return new THREE.Vector3(_p.x + ox, _p.y + height, _p.z + oz)
}

/** Hovering above the terrain at an absolute world spot. */
function atWorld(x: number, z: number, height: number): THREE.Vector3 {
  return new THREE.Vector3(x, getTerrainHeight(x, z) + height, z)
}

interface ShardDef {
  position: THREE.Vector3
  /** off the road, has to be hunted for */
  hidden: boolean
  /** only reachable with the wheels off the ground */
  air: boolean
  where: string
}

const COUNT = 11

/**
 * Deal a round: 10 shards to fresh random spots + the permanent crater
 * sentinel. Seeded by the round number, so a round is repeatable but no
 * two rounds match (and a restart genuinely reshuffles the hunt).
 */
function buildShards(round: number): ShardDef[] {
  const rng = mulberry32(0x5da2d ^ (round * 2654435761))
  const out: ShardDef[] = []

  // 6 over the road: random spot around the lap, random lane position
  for (let i = 0; i < 6; i++) {
    out.push({
      position: overRoad(rng(), (rng() * 2 - 1) * 3.4, 1.65),
      hidden: false,
      air: false,
      where: 'over the road somewhere - drive the lap',
    })
  }

  // 1 high over a random crest jump - airborne or nothing
  const j = JUMPS[Math.floor(rng() * JUMPS.length) % JUMPS.length]
  const jt = nearestRoadPoint(j.anchor[0], j.anchor[1]).t
  out.push({
    position: overRoad(jt + along(AIR_LEAD), 0, AIR_HEIGHT),
    hidden: false,
    air: true,
    where: 'high over a crest jump',
  })

  // 1 high over a random geyser - the blast is the ladder
  const v = VENTS[Math.floor(rng() * VENTS.length) % VENTS.length]
  out.push({
    position: atWorld(v.x, v.z, 8.5),
    hidden: false,
    air: true,
    where: 'high over a geyser - ride the blast',
  })

  // 2 hidden in the open country: rejection-sampled like the crash props -
  // off the road, on ground flat enough to actually drive to
  for (let i = 0; i < 2; i++) {
    let x = 0
    let z = 0
    for (let attempt = 0; attempt < 60; attempt++) {
      x = (rng() * 2 - 1) * 560
      z = (rng() * 2 - 1) * 560
      if (Math.hypot(x, z) > 560) continue
      if (roadDistance(x, z, 25) < 24) continue
      const e = 3
      const gx = getTerrainHeight(x + e, z) - getTerrainHeight(x - e, z)
      const gz = getTerrainHeight(x, z + e) - getTerrainHeight(x, z - e)
      if (Math.hypot(gx, gz) / (2 * e) > 0.28) continue
      break
    }
    out.push({
      position: atWorld(x, z, 1.5),
      hidden: true,
      air: false,
      where: 'hidden out in the open country',
    })
  }

  // The permanent one: high above the cinder cone's crater. The geyser INSIDE
  // the crater is the elevator - Nathan + Josh's design, do not reshuffle it.
  out.push({
    position: atWorld(-190, -285, 35.6),
    hidden: true,
    air: true,
    where: 'above the cinder cone crater - the crater geyser is the lift',
  })

  return out
}

/** Deterministic phase per shard so they bob and tumble out of sync. */
const PHASE = Array.from({ length: COUNT }, (_, i) => i * 2.399963) // golden angle, radians

// ---------- per-frame scratch ----------

const _obj = new THREE.Object3D()
const _colour = new THREE.Color('#FFD9A8')

declare global {
  interface Window {
    /** Dev probe: shard positions + pickup state. */
    __delights?: {
      total: number
      found: () => number
      radius: number
      list: () => Array<{ i: number; x: number; y: number; z: number; alive: boolean; hidden: boolean; air: boolean; where: string }>
      /** verification helper - collects every shard still out there */
      collectAll: () => void
    }
  }
}

export function Delights() {
  const coreRef = useRef<THREE.InstancedMesh>(null)
  const haloRef = useRef<THREE.InstancedMesh>(null)

  // alive[i] = still collectable. popT[i] > 0 = playing its pickup animation.
  // defs is the CURRENT round's layout - redealt when resetTick moves.
  const state = useMemo(
    () => ({
      defs: buildShards(0),
      round: 0,
      alive: Array.from({ length: COUNT }, () => true),
      popT: Array.from({ length: COUNT }, () => 0),
      time: 0,
      combo: 0,
      comboLap: 0,
    }),
    []
  )

  useEffect(() => {
    useGameStore.getState().setCollectiblesTotal(COUNT)
  }, [])

  const collect = useMemo(
    () => (i: number) => {
      if (!state.alive[i]) return
      state.alive[i] = false
      state.popT[i] = 1e-6

      // Consecutive pickups within one lap climb the scale. A new lap resets it.
      const lap = useGameStore.getState().lapCount
      if (lap !== state.comboLap) {
        state.comboLap = lap
        state.combo = 0
      }
      audio.playChime(state.combo)
      state.combo++

      // ---- the shard hunt clock ----
      const store = useGameStore.getState()
      if (store.collectiblesFound === 0) store.huntStart(performance.now())
      store.foundCollectible()
      const after = useGameStore.getState()
      if (after.collectiblesFound >= COUNT && after.huntStartedAt > 0) {
        after.huntFinish(performance.now() - after.huntStartedAt)
      }
    },
    [state]
  )

  useEffect(() => {
    window.__delights = {
      total: COUNT,
      radius: PICKUP_RADIUS,
      found: () => useGameStore.getState().collectiblesFound,
      list: () =>
        state.defs.map((s, i) => ({
          i,
          x: +s.position.x.toFixed(2),
          y: +s.position.y.toFixed(2),
          z: +s.position.z.toFixed(2),
          alive: state.alive[i],
          hidden: s.hidden,
          air: s.air,
          where: s.where,
        })),
      collectAll: () => {
        for (let i = 0; i < COUNT; i++) if (state.alive[i]) collect(i)
      },
    }
    return () => {
      delete window.__delights
    }
  }, [state, collect])

  useFrame((_, dt) => {
    const core = coreRef.current
    const halo = haloRef.current
    if (!core || !halo) return

    state.time += dt
    const time = state.time
    const car = telemetry.carPosition

    // ---- new round? re-deal the hunt ----
    if (vehicleSignals.resetTick !== state.round) {
      state.round = vehicleSignals.resetTick
      state.defs = buildShards(state.round)
      state.alive.fill(true)
      state.popT.fill(0)
      state.combo = 0
      useGameStore.getState().resetCollectibles()
    }

    for (let i = 0; i < COUNT; i++) {
      const shard = state.defs[i]
      const phase = PHASE[i]
      const pop = state.popT[i]

      // ---- pickup ----
      if (state.alive[i]) {
        const dx = car.x - shard.position.x
        const dy = car.y - shard.position.y
        const dz = car.z - shard.position.z
        if (dx * dx + dy * dy + dz * dz < PICKUP_R2) collect(i)
      }

      // ---- transform ----
      let scale = 1
      let lift = Math.sin(time * 1.4 + phase) * 0.28
      let spin = time * 0.7 + phase

      if (pop > 0) {
        const u = Math.min(1, pop / POP_SECONDS)
        state.popT[i] = pop + dt
        // swell then vanish, spinning out as it goes
        scale = u < 0.35 ? 1 + u * 1.7 : Math.max(0, 1.6 * (1 - (u - 0.35) / 0.65))
        lift += u * 2.2
        spin += u * 7
      } else if (!state.alive[i]) {
        scale = 0
      }

      _obj.position.set(shard.position.x, shard.position.y + lift, shard.position.z)
      _obj.rotation.set(0.34, spin, 0.12)
      _obj.scale.setScalar(scale)
      _obj.updateMatrix()
      core.setMatrixAt(i, _obj.matrix)

      _obj.scale.setScalar(scale * (1 + 0.07 * Math.sin(time * 2.2 + phase)))
      _obj.updateMatrix()
      halo.setMatrixAt(i, _obj.matrix)
    }

    core.instanceMatrix.needsUpdate = true
    halo.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={coreRef} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <octahedronGeometry args={[0.62, 0]} />
        <meshStandardMaterial
          color={_colour}
          emissive="#FFB35C"
          emissiveIntensity={2.4}
          roughness={0.22}
          metalness={0.05}
          flatShading
        />
      </instancedMesh>

      {/* the glow the bloom pass grabs hold of */}
      <instancedMesh ref={haloRef} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <octahedronGeometry args={[1.32, 0]} />
        <meshBasicMaterial
          color="#FFB35C"
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  )
}
