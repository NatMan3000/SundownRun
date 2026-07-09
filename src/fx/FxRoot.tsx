import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CONFIG } from '../core/config'
import { telemetry } from '../core/telemetry'
import { carVisual } from '../vehicle/carVisual'
import { Puffs } from './particles'
import { SkidMarks } from './skidmarks'

// ============================================================
//  DRIVING FX - what the tyres leave behind
// ------------------------------------------------------------
//  Three systems, three draw calls, one useFrame:
//
//    SMOKE  fired from the rear contact patches while the tyres
//           are sliding on asphalt. Warm, because everything in
//           this world is lit by a low sun.
//    DUST   the same pool tuned differently: sparser, browner,
//           lifted off the ground, fired whenever a wheel is off
//           the road and moving.
//    SKIDS  a ring buffer of quads laid between successive
//           contact points while the rears are lit up.
//
//  All three read the SAME source of truth the camera does -
//  telemetry (world pose, slip, onRoad) and carVisual (chassis-
//  local wheel positions, contact flags). Wheel contact patches
//  are reconstructed here rather than stored, so the vehicle
//  never has to know that fx exist.
//
//  Every vector below is module scope. This file allocates
//  nothing per frame.
// ============================================================

const REAR = [2, 3] as const //  carVisual.wheels is [FL, FR, RL, RR]

// Emission thresholds. Slip is 0..1 from the tyre model.
const SMOKE_SLIP = 0.22
const SKID_SLIP = 0.3
const SMOKE_SPEED = 5 //         m/s
const DUST_SPEED = 4
/** Metres of travel between skid quads. Shorter reads smoother, costs buffer. */
const SKID_STEP = 0.32
const SKID_HALF_WIDTH = 0.132
const SKID_LIFT = 0.014 //       metres above the road

const _contact = new THREE.Vector3()
const _right = new THREE.Vector3()
const _aL = new THREE.Vector3()
const _aR = new THREE.Vector3()
const _bL = new THREE.Vector3()
const _bR = new THREE.Vector3()

/** Previous skid cross-section per rear wheel, and whether it is valid. */
const skidPrev = [
  { left: new THREE.Vector3(), right: new THREE.Vector3(), live: false, travel: 0 },
  { left: new THREE.Vector3(), right: new THREE.Vector3(), live: false, travel: 0 },
]

const emitAccum = [0, 0]
const dustAccum = [0, 0]

/** Wheel contact patch, chassis-local -> world. Writes `_contact`. */
function contactPoint(index: number): boolean {
  const w = carVisual.wheels[index]
  if (!w.contact) return false
  _contact.set(w.position.x, w.position.y - w.radius, w.position.z)
  _contact.applyQuaternion(telemetry.carQuaternion).add(telemetry.carPosition)
  return true
}

export function FxRoot() {
  const smoke = useMemo(
    () =>
      new Puffs({
        count: 220,
        lit: '#F6DFC6',
        shade: '#7C7169',
        rise: 1.7,
        drag: 1.1,
        renderOrder: 3,
      }),
    []
  )

  const dust = useMemo(
    () =>
      new Puffs({
        // Lighter than the ground it comes off, or it simply disappears: the
        // sun-bleached grass is already #C9A85C, and dust the same value as the
        // surface it is kicked from is dust nobody can see.
        count: 170,
        lit: '#F2E0BC',
        shade: '#9A8158',
        rise: 0.95,
        drag: 1.5,
        renderOrder: 2,
      }),
    []
  )

  const skids = useMemo(() => new SkidMarks(), [])

  useEffect(
    () => () => {
      smoke.dispose()
      dust.dispose()
      skids.dispose()
    },
    [smoke, dust, skids]
  )

  useFrame((_, rawDt) => {
    // A stalled tab hands back a huge delta. Cap it, or one alt-tab dumps the
    // whole particle pool into a single frame.
    const dt = Math.min(rawDt, 0.05)

    const vel = telemetry.carVelocity
    const speed = Math.hypot(vel.x, vel.z)
    const slip = telemetry.slip

    _right.set(1, 0, 0).applyQuaternion(telemetry.carQuaternion)

    const smoking = CONFIG.driftSmoke && telemetry.onRoad && slip > SMOKE_SLIP && speed > SMOKE_SPEED
    const dusting = !telemetry.onRoad && speed > DUST_SPEED
    const skidding = telemetry.onRoad && slip > SKID_SLIP && speed > SMOKE_SPEED

    for (let k = 0; k < 2; k++) {
      const wheel = REAR[k]
      const prev = skidPrev[k]

      if (!contactPoint(wheel)) {
        prev.live = false
        continue
      }
      const cx = _contact.x
      const cy = _contact.y
      const cz = _contact.z

      // ---------- tyre smoke ----------
      //
      // Peak alpha is LOW on purpose. A plume is thirty overlapping puffs, and
      // alpha compositing stacks: at 0.3 each, ten of them reach opacity 0.97
      // and the whole thing paints itself onto the road as a solid stripe.
      // Keep each puff nearly transparent and let the stacking build the plume.
      if (smoking) {
        const bite = (slip - SMOKE_SLIP) / (1 - SMOKE_SLIP)
        emitAccum[k] += (14 + 52 * bite) * dt
        while (emitAccum[k] >= 1) {
          emitAccum[k] -= 1
          smoke.emit(
            cx,
            cy + 0.12,
            cz,
            vel.x * 0.14 - _right.x * bite * 1.3,
            0.55 + bite * 0.7,
            vel.z * 0.14 - _right.z * bite * 1.3,
            0.45,
            2.4 + bite * 1.8,
            1.35 + bite * 0.95,
            0.16 + bite * 0.16
          )
        }
      } else {
        emitAccum[k] = 0
      }

      // ---------- off-road dust ----------
      if (dusting) {
        const pace = Math.min(1, speed / 22)
        dustAccum[k] += (8 + 30 * pace + 24 * slip) * dt
        while (dustAccum[k] >= 1) {
          dustAccum[k] -= 1
          dust.emit(
            cx,
            cy + 0.07,
            cz,
            -vel.x * 0.09,
            0.4 + pace * 0.45,
            -vel.z * 0.09,
            0.34,
            1.9 + pace * 1.4,
            1.1 + pace * 0.7,
            0.2 + pace * 0.16
          )
        }
      } else {
        dustAccum[k] = 0
      }

      // ---------- skid marks ----------
      if (!skidding) {
        prev.live = false
        continue
      }

      _aL.set(cx + _right.x * SKID_HALF_WIDTH, cy + SKID_LIFT, cz + _right.z * SKID_HALF_WIDTH)
      _aR.set(cx - _right.x * SKID_HALF_WIDTH, cy + SKID_LIFT, cz - _right.z * SKID_HALF_WIDTH)

      if (!prev.live) {
        prev.left.copy(_aL)
        prev.right.copy(_aR)
        prev.live = true
        prev.travel = 0
        continue
      }

      prev.travel += speed * dt
      if (prev.travel < SKID_STEP) continue
      prev.travel = 0

      _bL.copy(prev.left)
      _bR.copy(prev.right)
      const strength = Math.min(1, (slip - SKID_SLIP) / 0.4) * 0.85 + 0.15
      skids.push(
        _bL.x,
        _bL.y,
        _bL.z,
        _bR.x,
        _bR.y,
        _bR.z,
        _aL.x,
        _aL.y,
        _aL.z,
        _aR.x,
        _aR.y,
        _aR.z,
        strength
      )
      prev.left.copy(_aL)
      prev.right.copy(_aR)
    }

    smoke.update(dt)
    dust.update(dt)
    skids.update(dt)
  })

  return (
    <>
      <primitive object={skids.mesh} />
      <primitive object={dust.mesh} />
      <primitive object={smoke.mesh} />
    </>
  )
}
