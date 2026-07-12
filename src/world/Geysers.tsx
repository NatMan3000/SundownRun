// ============================================================
//  GEYSERS - the volcano is not as asleep as it looks
// ------------------------------------------------------------
//  Steam vents on the valley floor that erupt on a rhythm:
//
//    idle    - a lazy wisp every second or so, so you can find them
//    warning - the last ~1.6 s before a blow, the wisps quicken (the
//              "get on it NOW" tell - the timing is learnable)
//    ERUPT   - 1.3 s of roaring steam column. A car over the vent is
//              hurled skyward: real airtime, chains into the trick
//              system, and GEYSER LAUNCH points on the way up.
//
//  No collider - the vent crust is dressing, the LAUNCH is the game.
//  The physics side borrows CrashProps' trick: find the (dynamic,
//  heavy) car in the world each step, no coupling to the vehicle
//  module. One Puffs system draws every vent's steam in one call.
//
//  Timing runs off the render clock; each vent carries a phase offset
//  so the world breathes instead of firing in unison. Eruptions are a
//  local affair in multiplayer - your machine launches only your car.
// ============================================================

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep } from '@react-three/rapier'
import { CONFIG } from '../core/config'
import { getTerrainHeight } from '../core/terrain'
import { emitTrick } from '../core/tricks'
import { Puffs } from '../fx/particles'
import type { BodyQuery } from './treeSmash'

/** Where the vents live. Exported so the world map can pin them. */
export const VENTS: readonly { x: number; z: number; phase: number }[] = [
  { x: -105, z: -388, phase: 0 }, //   beside the south straight - visible from the racing line
  { x: -148, z: -238, phase: 2.9 }, // on the approach to the cinder cone's breach
  { x: 305, z: 355, phase: 5.6 }, //   the north pocket, near the double
]

const PERIOD = 8 //     seconds per full cycle
const ERUPT_S = 1.3 //  seconds of full blast at the start of each cycle
const WARN_S = 1.6 //   quickened wisps before the blast
const LAUNCH_R = 4.4 // metres from the vent centre that still catches the blast
const LAUNCH_VY = 24 // m/s straight up - comfortably BIG AIR territory

const _v = new THREE.Vector3()

export function Geysers() {
  if (!CONFIG.geysers) return null
  return <GeysersInner />
}

function GeysersInner() {
  const vents = useMemo(
    () => VENTS.map((v) => ({ ...v, y: getTerrainHeight(v.x, v.z) })),
    []
  )

  // one shared steam system - every vent emits into the same instanced mesh
  const puffs = useMemo(
    () =>
      new Puffs({
        count: 300,
        lit: '#FFE9C8',
        shade: '#B49B78',
        rise: 2.4,
        drag: 0.65,
        renderOrder: 6,
      }),
    []
  )
  useEffect(() => {
    const m = puffs.mesh
    return () => {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
  }, [puffs])

  // the vent crust: a dark ring + a bleached mineral apron, sunk into the ground
  const crust = useMemo(() => {
    const ring = new THREE.TorusGeometry(1.6, 0.55, 7, 18)
    const apron = new THREE.CircleGeometry(3.6, 20)
    return { ring, apron }
  }, [])
  const ringMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#4A4038', roughness: 0.95 }),
    []
  )
  const apronMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#D8C9A4', roughness: 0.94 }),
    []
  )
  useEffect(
    () => () => {
      crust.ring.dispose()
      crust.apron.dispose()
      ringMat.dispose()
      apronMat.dispose()
    },
    [crust, ringMat, apronMat]
  )

  // Live eruption flags, written by the render loop, read by the physics step.
  // (A frame of lag between the two is far below anything a human can feel.)
  const erupting = useRef<boolean[]>(VENTS.map(() => false))
  const cycleIndex = useRef<number[]>(VENTS.map(() => -1))
  const launchedCycle = useRef<number[]>(VENTS.map(() => -2))

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < vents.length; i++) {
      const v = vents[i]
      const cyc = (t + v.phase) % PERIOD
      cycleIndex.current[i] = Math.floor((t + v.phase) / PERIOD)
      const blowing = cyc < ERUPT_S
      erupting.current[i] = blowing

      if (blowing) {
        // the column: fast, hot, dense
        for (let k = 0; k < 7; k++) {
          puffs.emit(
            v.x + (Math.random() - 0.5) * 1.2,
            v.y + 0.6,
            v.z + (Math.random() - 0.5) * 1.2,
            0,
            13 + Math.random() * 8,
            0,
            0.8,
            3.1,
            1.05,
            0.5
          )
        }
      } else if (cyc > PERIOD - WARN_S) {
        // the tell: quickening wisps
        if (Math.random() < dt * 14) {
          puffs.emit(v.x, v.y + 0.5, v.z, 0, 2.6, 0, 0.4, 1.4, 1.1, 0.3)
        }
      } else if (Math.random() < dt * 1.4) {
        // idle: a lazy wisp so the vent can be spotted from the road
        puffs.emit(v.x, v.y + 0.5, v.z, 0, 1.6, 0, 0.35, 1.2, 1.6, 0.22)
      }
    }
    puffs.update(dt)
  })

  // ----- the launch: hurl any car sitting on an erupting vent -----
  useBeforePhysicsStep((w: BodyQuery) => {
    let car: any = null
    w.forEachRigidBody((b: any) => {
      if (!car && b.isDynamic() && b.mass() > 200) car = b
    })
    if (!car) return
    const p = car.translation()
    for (let i = 0; i < vents.length; i++) {
      if (!erupting.current[i]) continue
      if (launchedCycle.current[i] === cycleIndex.current[i]) continue // one launch per blow
      const v = vents[i]
      const dx = p.x - v.x
      const dz = p.z - v.z
      if (dx * dx + dz * dz > LAUNCH_R * LAUNCH_R) continue
      if (p.y - v.y > 3.5) continue // already flying - the steam can't reach
      launchedCycle.current[i] = cycleIndex.current[i]
      const lv = car.linvel()
      _v.set(lv.x, Math.max(lv.y, LAUNCH_VY), lv.z)
      car.setLinvel(_v, true)
      emitTrick('GEYSER LAUNCH', 30, 1)
    }
  })

  return (
    <>
      <primitive object={puffs.mesh} />
      {vents.map((v, i) => (
        <group key={i} position={[v.x, v.y, v.z]}>
          {/* crust ring, sunk so it reads as a lip rather than a donut */}
          <mesh
            geometry={crust.ring}
            material={ringMat}
            position={[0, 0.1, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            castShadow
          />
          {/* bleached mineral apron */}
          <mesh
            geometry={crust.apron}
            material={apronMat}
            position={[0, 0.06, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          />
        </group>
      ))}
    </>
  )
}
