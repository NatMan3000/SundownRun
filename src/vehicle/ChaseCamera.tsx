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
//  THREE MODES (C on keyboard, RB on gamepad - see cameraMode.ts).
//  A mode change does not switch rigs; it EASES the target between
//  them over CAMERA_TRANSITION_S while the springs keep smoothing.
//  Even the bonnet cam is sprung, never welded.
//
//  Zero allocation per frame.
// ============================================================

import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CONFIG } from '../core/config'
import { cameraSignal } from '../core/input'
import { telemetry } from '../core/telemetry'
import { getTerrainHeight } from '../core/terrain'
import { CAMERA } from './tuning'
import { vehicleSignals } from './vehicleSignals'
import { CAMERA_RIGS, CAMERA_TRANSITION_S, cameraState, cycleCamera } from './cameraMode'
import type { CameraRig } from './cameraMode'

const _camPos = new THREE.Vector3()
const _lookPos = new THREE.Vector3()
const _targetPos = new THREE.Vector3()
const _targetLook = new THREE.Vector3()
const _posA = new THREE.Vector3()
const _lookA = new THREE.Vector3()
const _posB = new THREE.Vector3()
const _lookB = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _fwd3d = new THREE.Vector3()
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

function smoothstep01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  return x * x * (3 - 2 * x)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Where this rig wants the camera and its look target to be, right now.
 * `orbit` rigs sit behind the velocity vector; `mount` rigs ride the chassis.
 */
function rigTarget(rig: CameraRig, speed: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
  const carPos = telemetry.carPosition

  if (rig.kind === 'mount') {
    // Bolted to the chassis: full 3D orientation, so a crest pitches the view.
    _tmp.set(0, rig.mountY, rig.mountZ).applyQuaternion(telemetry.carQuaternion)
    outPos.copy(carPos).add(_tmp)
    outLook
      .copy(outPos)
      .addScaledVector(_fwd3d, rig.lookAhead + speed * rig.lookAheadSpeedGain)
    outLook.y += rig.lookHeight
    return
  }

  const speedFrac = Math.min(speed / V_TOP(), 1)

  _dir.copy(_fwd)
  if (speed > 3) {
    _vel.set(telemetry.carVelocity.x, 0, telemetry.carVelocity.z).normalize()
    // Reversing must not whip the camera around to the front.
    if (_vel.dot(_fwd) > 0) {
      const blend =
        Math.min(speed / 10, 1) * (rig.velocityBlendBase + rig.velocityBlendSlip * telemetry.slip)
      _dir.lerp(_vel, Math.min(blend, 0.9)).normalize()
    }
  }

  const dist = rig.distance * (1 + CAMERA.distanceSpeedGain * speedFrac)
  const height = rig.height * (1 + CAMERA.heightSpeedGain * speedFrac)

  outPos.copy(carPos).addScaledVector(_dir, -dist)
  outPos.y += height

  outLook.copy(carPos).addScaledVector(_fwd, rig.lookAhead + speed * rig.lookAheadSpeedGain)
  outLook.y += rig.lookHeight
}

export function ChaseCamera() {
  const s = useRef({
    ready: false,
    fov: CONFIG.fovBase as number,
    resetTick: -1,
    cycleNonce: 0,
    groundY: 0,
    groundTimer: 0,
    /** heading the orbit follows while airborne - see the spin note below */
    airFwd: new THREE.Vector3(0, 0, 1),
  }).current

  useFrame((state, rawDt) => {
    const cam = state.camera as THREE.PerspectiveCamera
    const dt = Math.min(rawDt, 1 / 20) // a stall must not fling the camera
    const t = state.clock.elapsedTime

    // ---- C / RB: advance the mode, then ease across ----
    if (s.cycleNonce !== cameraSignal.cycleNonce) {
      s.cycleNonce = cameraSignal.cycleNonce
      cycleCamera()
    }
    if (cameraState.transition < 1) {
      cameraState.transition = Math.min(1, cameraState.transition + dt / CAMERA_TRANSITION_S)
    }
    const ease = smoothstep01(cameraState.transition)
    const rigA = CAMERA_RIGS[cameraState.from]
    const rigB = CAMERA_RIGS[cameraState.mode]

    _fwd3d.set(0, 0, 1).applyQuaternion(telemetry.carQuaternion)
    _fwd.copy(_fwd3d)
    _fwd.y = 0
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1)
    _fwd.normalize()

    const speed = Math.hypot(telemetry.carVelocity.x, telemetry.carVelocity.z)
    const speedFrac = Math.min(speed / V_TOP(), 1)

    // ---- airborne: the camera keeps its own head ----
    // Mid-air the car may be SPINNING for points, and a camera glued to the
    // nose spins the whole world with it (nausea is a bug - constitution).
    // While airborne the orbit follows a HELD heading that drifts only toward
    // the flight direction, so the car tumbles readably inside a steady frame.
    // On landing _fwd snaps back to the true nose and the springs catch it up.
    // The bonnet cam is untouched: it is bolted to the chassis on purpose.
    if (telemetry.airborne) {
      if (speed > 3) {
        _vel.set(telemetry.carVelocity.x, 0, telemetry.carVelocity.z).normalize()
        s.airFwd.lerp(_vel, Math.min(1, dt * 1.2)).normalize()
      }
      _fwd.copy(s.airFwd)
    } else {
      s.airFwd.copy(_fwd)
    }

    // Default for mount rigs, which never compute an orbit direction. The impact
    // kick reads it, so it must never be left over from a previous frame.
    _dir.copy(_fwd)

    // ---- blend the two rigs' TARGETS, not their springs. At ease=0 this is the
    //      old rig exactly, at ease=1 the new one exactly, and the springs smooth
    //      whatever comes out - so a mode change glides instead of cutting. ----
    rigTarget(rigA, speed, _posA, _lookA)
    rigTarget(rigB, speed, _posB, _lookB)
    _targetPos.lerpVectors(_posA, _posB, ease)
    _targetLook.lerpVectors(_lookA, _lookB, ease)
    // Ease finished: collapse `from` onto `mode` so both rigs are the active one.
    if (cameraState.transition >= 1 && cameraState.from !== cameraState.mode) {
      cameraState.from = cameraState.mode
    }

    const drifting = telemetry.drifting
    const smoothA = drifting ? rigA.posSmoothDrift : rigA.posSmooth
    const smoothB = drifting ? rigB.posSmoothDrift : rigB.posSmooth
    const posSmooth = lerp(smoothA, smoothB, ease)
    const lookSmooth = lerp(rigA.lookSmooth, rigB.lookSmooth, ease)
    const shakeScale = lerp(rigA.shakeScale, rigB.shakeScale, ease)
    const fovOffset = lerp(rigA.fovOffset, rigB.fovOffset, ease)
    const groundClamp = lerp(rigA.groundClamp, rigB.groundClamp, ease)

    // Cancel the spring's steady-state lag for mount rigs (see CameraRig.velocityLead).
    const lead = lerp(rigA.velocityLead, rigB.velocityLead, ease)
    if (lead > 0.001) {
      _targetPos.addScaledVector(telemetry.carVelocity, lead * posSmooth)
      _targetLook.addScaledVector(telemetry.carVelocity, lead * lookSmooth)
    }

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
      _camPos.x = smoothDamp(_camPos.x, _targetPos.x, springVel, 0, posSmooth, dt)
      _camPos.y = smoothDamp(_camPos.y, _targetPos.y, springVel, 1, posSmooth, dt)
      _camPos.z = smoothDamp(_camPos.z, _targetPos.z, springVel, 2, posSmooth, dt)
      _lookPos.x = smoothDamp(_lookPos.x, _targetLook.x, springVel, 3, lookSmooth, dt)
      _lookPos.y = smoothDamp(_lookPos.y, _targetLook.y, springVel, 4, lookSmooth, dt)
      _lookPos.z = smoothDamp(_lookPos.z, _targetLook.z, springVel, 5, lookSmooth, dt)
    }

    // ---- never clip the ground. getTerrainHeight is O(n) and allocates, so
    //      it is sampled a few times a second and the result held. The bonnet cam
    //      opts out (groundClamp 0) - it rides the car, and the car is never buried.
    s.groundTimer -= dt
    if (s.groundTimer <= 0) {
      s.groundTimer = 1 / CAMERA.groundQueryHz
      s.groundY = getTerrainHeight(_camPos.x, _camPos.z)
    }
    if (groundClamp > 0.01) {
      const floor = s.groundY + CAMERA.groundClearance * groundClamp
      if (_camPos.y < floor) {
        _camPos.y = floor
        springVel[1] = 0
      }
    }

    cam.position.copy(_camPos)

    // ---- impact kick: a jolt on the body, damping out as telemetry.impact decays ----
    const kick = telemetry.impact * shakeScale
    if (kick > 0.001) {
      _tmp.set(0, 1, 0).applyQuaternion(cam.quaternion)
      cam.position.addScaledVector(_tmp, kick * CAMERA.kickPos * Math.sin(t * 34))
      _tmp.copy(_dir)
      cam.position.addScaledVector(_tmp, kick * CAMERA.kickPos * 0.6 * Math.sin(t * 27))
    }

    cam.lookAt(_lookPos)

    // ---- speed shake: rotational, tiny, and quadratic in speed so it is
    //      invisible until you are genuinely moving. Nausea is a bug. ----
    const shake = (CAMERA.shakeAmp * speedFrac * speedFrac + kick * CAMERA.kickRot) * shakeScale
    if (shake > 1e-5) {
      cam.rotateZ(shake * Math.sin(t * 31.7) * Math.sin(t * 9.1))
      cam.rotateX(shake * 0.7 * Math.sin(t * 24.3) * Math.sin(t * 5.7))
    }

    // ---- FOV opens up with speed ----
    const fovTarget =
      CONFIG.fovBase + (CONFIG.fovMax - CONFIG.fovBase) * (speedFrac * speedFrac) + fovOffset
    s.fov = smoothDamp(s.fov, fovTarget, springVel, 6, CAMERA.fovSmooth, dt)
    if (Math.abs(cam.fov - s.fov) > 0.01) {
      cam.fov = s.fov
      cam.updateProjectionMatrix()
    }
  })

  return null
}
