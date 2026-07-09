// ============================================================
//  CHASE CAMERA
// ------------------------------------------------------------
//  Springs, never parenting. The camera has its own position and
//  its own look target, and both chase the car through critically
//  damped springs - so it lags into corners, settles without
//  overshoot, and never snaps. The one exception is a reset.
//
//  The detail that sells the whole drift: the camera sits behind
//  the car's VELOCITY, not its nose. Kick the tail out and the
//  camera stays behind where you are actually going, so the car
//  reads sideways across the screen. Blend rises with slip.
//
//  Zero allocation per frame.
// ============================================================

import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CONFIG } from '../core/config'
import { telemetry } from '../core/telemetry'
import { getTerrainHeight } from '../core/terrain'
import { CAMERA } from './tuning'
import { vehicleSignals } from './vehicleSignals'

const _camPos = new THREE.Vector3()
const _lookPos = new THREE.Vector3()
const _targetPos = new THREE.Vector3()
const _targetLook = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _vel = new THREE.Vector3()
const _tmp = new THREE.Vector3()

// spring velocities: [0..2] camera position, [3..5] look target, [6] fov
const springVel = new Float64Array(7)

const V_TOP = () => CONFIG.topSpeedKmh / 3.6

/**
 * Critically damped smoothing (Unity's SmoothDamp). Unconditionally stable at any
 * dt, no overshoot, and `smoothTime` is an intuitive "how long to catch up".
 */
function smoothDamp(
  current: number,
  target: number,
  vel: Float64Array,
  i: number,
  smoothTime: number,
  dt: number
): number {
  const omega = 2 / smoothTime
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (vel[i] + omega * change) * dt
  vel[i] = (vel[i] - omega * temp) * exp
  return target + (change + temp) * exp
}

export function ChaseCamera() {
  const s = useRef({
    ready: false,
    fov: CONFIG.fovBase as number,
    resetTick: -1,
    groundY: 0,
    groundTimer: 0,
  }).current

  useFrame((state, rawDt) => {
    const cam = state.camera as THREE.PerspectiveCamera
    const dt = Math.min(rawDt, 1 / 20) // a stall must not fling the camera
    const t = state.clock.elapsedTime

    const carPos = telemetry.carPosition
    _fwd.set(0, 0, 1).applyQuaternion(telemetry.carQuaternion)
    _fwd.y = 0
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1)
    _fwd.normalize()

    const speed = Math.hypot(telemetry.carVelocity.x, telemetry.carVelocity.z)
    const speedFrac = Math.min(speed / V_TOP(), 1)

    // ---- which way is "behind"? Between the nose and the velocity. ----
    _dir.copy(_fwd)
    if (speed > 3) {
      _vel.set(telemetry.carVelocity.x, 0, telemetry.carVelocity.z).normalize()
      // Reversing must not whip the camera around to the front.
      if (_vel.dot(_fwd) > 0) {
        const blend =
          Math.min(speed / 10, 1) * (CAMERA.velocityBlendBase + CAMERA.velocityBlendSlip * telemetry.slip)
        _dir.lerp(_vel, Math.min(blend, 0.9)).normalize()
      }
    }

    const dist = CONFIG.cameraDistance * (1 + CAMERA.distanceSpeedGain * speedFrac)
    const height = CONFIG.cameraHeight * (1 + CAMERA.heightSpeedGain * speedFrac)

    _targetPos.copy(carPos).addScaledVector(_dir, -dist)
    _targetPos.y += height

    _targetLook
      .copy(carPos)
      .addScaledVector(_fwd, CAMERA.lookAhead + speed * CAMERA.lookAheadSpeedGain)
    _targetLook.y += CAMERA.lookHeight

    // ---- reset / first frame: the only sanctioned snap ----
    if (!s.ready || s.resetTick !== vehicleSignals.resetTick) {
      s.ready = true
      s.resetTick = vehicleSignals.resetTick
      _camPos.copy(_targetPos)
      _lookPos.copy(_targetLook)
      springVel.fill(0)
      s.groundY = getTerrainHeight(_camPos.x, _camPos.z)
      s.groundTimer = 0
    } else {
      const posSmooth = telemetry.drifting ? CAMERA.posSmoothDrift : CAMERA.posSmooth
      _camPos.x = smoothDamp(_camPos.x, _targetPos.x, springVel, 0, posSmooth, dt)
      _camPos.y = smoothDamp(_camPos.y, _targetPos.y, springVel, 1, posSmooth, dt)
      _camPos.z = smoothDamp(_camPos.z, _targetPos.z, springVel, 2, posSmooth, dt)
      _lookPos.x = smoothDamp(_lookPos.x, _targetLook.x, springVel, 3, CAMERA.lookSmooth, dt)
      _lookPos.y = smoothDamp(_lookPos.y, _targetLook.y, springVel, 4, CAMERA.lookSmooth, dt)
      _lookPos.z = smoothDamp(_lookPos.z, _targetLook.z, springVel, 5, CAMERA.lookSmooth, dt)
    }

    // ---- never clip the ground. getTerrainHeight is O(n) and allocates, so
    //      it is sampled a few times a second and the result held. ----
    s.groundTimer -= dt
    if (s.groundTimer <= 0) {
      s.groundTimer = 1 / CAMERA.groundQueryHz
      s.groundY = getTerrainHeight(_camPos.x, _camPos.z)
    }
    const floor = s.groundY + CAMERA.groundClearance
    if (_camPos.y < floor) {
      _camPos.y = floor
      springVel[1] = 0
    }

    cam.position.copy(_camPos)

    // ---- impact kick: a jolt on the body, damping out as telemetry.impact decays ----
    const kick = telemetry.impact
    if (kick > 0.001) {
      _tmp.set(0, 1, 0).applyQuaternion(cam.quaternion)
      cam.position.addScaledVector(_tmp, kick * CAMERA.kickPos * Math.sin(t * 34))
      _tmp.copy(_dir)
      cam.position.addScaledVector(_tmp, kick * CAMERA.kickPos * 0.6 * Math.sin(t * 27))
    }

    cam.lookAt(_lookPos)

    // ---- speed shake: rotational, tiny, and quadratic in speed so it is
    //      invisible until you are genuinely moving. Nausea is a bug. ----
    const shake = CAMERA.shakeAmp * speedFrac * speedFrac + kick * CAMERA.kickRot
    if (shake > 1e-5) {
      cam.rotateZ(shake * Math.sin(t * 31.7) * Math.sin(t * 9.1))
      cam.rotateX(shake * 0.7 * Math.sin(t * 24.3) * Math.sin(t * 5.7))
    }

    // ---- FOV opens up with speed ----
    const fovTarget = CONFIG.fovBase + (CONFIG.fovMax - CONFIG.fovBase) * (speedFrac * speedFrac)
    s.fov = smoothDamp(s.fov, fovTarget, springVel, 6, CAMERA.fovSmooth, dt)
    if (Math.abs(cam.fov - s.fov) > 0.01) {
      cam.fov = s.fov
      cam.updateProjectionMatrix()
    }
  })

  return null
}
