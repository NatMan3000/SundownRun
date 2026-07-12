// ============================================================
//  SUN SHARDS - the reason to go looking
// ------------------------------------------------------------
//  Ten warm crystals scattered around the circuit. Six hover over the racing
//  line where a kid will simply drive through them. Two sit high over the crest
//  jumps, out of reach unless the car is properly airborne. Two are hidden off
//  the road entirely, for the player who wonders what is over there.
//
//  Every position derives from core/terrain's roadSpline, so the circuit can be
//  redesigned and the shards follow it. Nothing here uses Math.random.
//
//  Two InstancedMeshes (core + additive halo), one useFrame, zero per-frame
//  allocation. Pickup is a squared-distance test against telemetry.carPosition.
// ============================================================

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { telemetry } from '../core/telemetry'
import { useGameStore } from '../core/store'
import { ROAD_LENGTH, getTerrainHeight, nearestRoadPoint, roadSpline } from '../core/terrain'
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

/** Hovering above the terrain, well off the road. */
function overGround(t: number, lateral: number, height: number): THREE.Vector3 {
  roadSpline.getPointAt(wrap(t), _p)
  const [ox, oz] = lateralOffset(t, lateral)
  const x = _p.x + ox
  const z = _p.z + oz
  return new THREE.Vector3(x, getTerrainHeight(x, z) + height, z)
}

/** Hovering above the terrain at an absolute world spot (for landmarks that are
 *  places in their own right, not road-relative - e.g. the cinder cone crater). */
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

function buildShards(): ShardDef[] {
  // The two crest jumps are authored by world position in core/terrain. Resolve
  // them back to spline parameters so the shards ride the jumps, not a number.
  const jump1 = nearestRoadPoint(70, -412).t
  const jump2 = nearestRoadPoint(150, 472).t
  const hairpin = nearestRoadPoint(8, 168).t
  const switchbackIn = nearestRoadPoint(190, 172).t

  return [
    { position: overRoad(0.03, 0, 1.7), hidden: false, air: false, where: 'south straight, first one you meet' },
    { position: overRoad(jump1 + along(AIR_LEAD), 0, AIR_HEIGHT), hidden: false, air: true, where: 'over crest jump 1' },
    { position: overRoad(0.15, -3.2, 1.6), hidden: false, air: false, where: 'turn 1 entry, on the line' },
    { position: overRoad(0.255, 3.4, 1.7), hidden: false, air: false, where: 'east sweeper, outside line' },
    { position: overRoad(0.395, 0, 1.6), hidden: false, air: false, where: 'switchback inbound leg' },
    { position: overGround(hairpin + along(6), 24, 1.5), hidden: true, air: false, where: 'behind the hairpin' },
    { position: overRoad(0.53, -2.8, 1.6), hidden: false, air: false, where: 'hairpin exit, inside line' },
    { position: overRoad(jump2 + along(AIR_LEAD), 0, AIR_HEIGHT), hidden: false, air: true, where: 'over crest jump 2' },
    { position: overRoad(0.815, 3.0, 1.7), hidden: false, air: false, where: 'west sweeper' },
    { position: overGround(switchbackIn, -42, 1.5), hidden: true, air: false, where: 'the ridge between the switchback legs' },
    // #11 sits at the bottom of the cinder cone's crater (core/terrain.ts
    // PLAYGROUNDS 'cone' at [-190, -285]) - the walls are too steep to drive
    // out, so collecting it means committing to the drop and the breach exit.
    { position: atWorld(-190, -285, 1.6), hidden: true, air: false, where: 'inside the cinder cone crater' },
  ]
}

const SHARDS = buildShards()
const COUNT = SHARDS.length

/** Deterministic phase per shard so they bob and tumble out of sync. */
const PHASE = SHARDS.map((_, i) => i * 2.399963) // golden angle, radians

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
  const state = useMemo(
    () => ({
      alive: SHARDS.map(() => true),
      popT: SHARDS.map(() => 0),
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

      useGameStore.getState().foundCollectible()
    },
    [state]
  )

  useEffect(() => {
    window.__delights = {
      total: COUNT,
      radius: PICKUP_RADIUS,
      found: () => useGameStore.getState().collectiblesFound,
      list: () =>
        SHARDS.map((s, i) => ({
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

    for (let i = 0; i < COUNT; i++) {
      const shard = SHARDS[i]
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
