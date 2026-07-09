// ============================================================
//  RAYCAST SUSPENSION CAR
// ------------------------------------------------------------
//  One dynamic rigid body (the chassis). No wheel colliders - each
//  corner is a downward ray from an anchor point, and everything
//  the car does is a force applied at the four contact patches:
//
//    suspension  spring + damper along the chassis up-axis
//    longitudinal  engine / brakes / rolling resistance
//    lateral       slip-angle tyre curve (see TYRE in tuning.ts)
//    both clipped together by a friction circle, which is what
//    turns "throttle in a corner" into "the rear steps out".
//
//  Runs in useBeforePhysicsStep at a fixed 60Hz - deterministic,
//  frame-rate independent, and the same code path whether a human
//  or the demo autopilot is driving.
//
//  ALLOCATION: zero per step from this module. Every vector is a
//  module-level temp. (rapier's own translation()/linvel() getters
//  each return a small fresh {x,y,z}; that is four objects a step
//  and is unavoidable through the public API.)
// ============================================================

import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'

import { CONFIG } from '../core/config'
import { telemetry } from '../core/telemetry'
import { useGameStore } from '../core/store'
import { initInput, input, restartSignal, steeringGain, updateInput } from '../core/input'
import { ROAD_WIDTH, getSpawn, getTerrainHeight, nearestRoadPoint } from '../core/terrain'

import { carVisual } from './carVisual'
import type { CarBodyHandle } from './carVisual'
import { LapTracker } from './lapTracker'
import { vehicleSignals } from './vehicleSignals'
import {
  AERO,
  ASSIST,
  CHASSIS,
  DRIVE,
  DT,
  GEAR_TOP_KMH,
  RAY_LENGTH,
  RPM,
  STATE,
  STEERING,
  SUSPENSION,
  TYRE,
  VISUAL,
  WHEEL,
} from './tuning'

// ---------- module temps (never allocated per step) ----------
const _q = new THREE.Quaternion()
const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _pos = new THREE.Vector3()
const _com = new THREE.Vector3()
const _linvel = new THREE.Vector3()
const _angvel = new THREE.Vector3()
const _prevLinvel = new THREE.Vector3()
const _anchor = new THREE.Vector3()
const _arm = new THREE.Vector3()
const _pointVel = new THREE.Vector3()
const _ground = new THREE.Vector3()
const _force = new THREE.Vector3()
const _tyreSum = new THREE.Vector3()
const _tmp = new THREE.Vector3()
const AXIS_Y = new THREE.Vector3(0, 1, 0)

// rapier accepts plain {x,y,z} - reuse two of them
const _rv = { x: 0, y: 0, z: 0 }
const _rp = { x: 0, y: 0, z: 0 }

// ---------- per-wheel scratch ----------
const WHEEL_COUNT = 4
const anchorsLocal: THREE.Vector3[] = [
  new THREE.Vector3(WHEEL.halfTrack, WHEEL.anchorY, WHEEL.halfBase), //   FL
  new THREE.Vector3(-WHEEL.halfTrack, WHEEL.anchorY, WHEEL.halfBase), //  FR
  new THREE.Vector3(WHEEL.halfTrack, WHEEL.anchorY, -WHEEL.halfBase), //  RL
  new THREE.Vector3(-WHEEL.halfTrack, WHEEL.anchorY, -WHEEL.halfBase), // RR
]
const contactPts: THREE.Vector3[] = [
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
]
const wheelFwds: THREE.Vector3[] = [
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
]
const wheelRights: THREE.Vector3[] = [
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
]
const compression = new Float64Array(WHEEL_COUNT)
const suspForce = new Float64Array(WHEEL_COUNT)
const rayHit = new Float64Array(WHEEL_COUNT)
const grounded: boolean[] = [false, false, false, false]
const wheelOmega = new Float64Array(WHEEL_COUNT)
const latSlip = new Float64Array(WHEEL_COUNT)
const longClip = new Float64Array(WHEEL_COUNT)
const driving: boolean[] = [false, false, false, false]
/** Fraction of engine force each wheel receives. Front stays 0 - this car is RWD. */
const driveShare = new Float64Array(WHEEL_COUNT)

// ---------- helpers ----------
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
function approach(cur: number, target: number, rate: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt))
}

// ---------- the NaN firewall ----------
// A single non-finite number handed to rapier panics the WASM ("RuntimeError:
// unreachable"). The panic unwinds with a Rust RefCell still borrowed, so EVERY
// subsequent rapier call then throws "recursive use of an object detected which
// would lead to unsafe aliasing in rust" - once per step, forever. The car freezes
// and telemetry reads NaN. It is unrecoverable and it buries its own cause.
//
// So nothing crosses into rapier unchecked. A bad value is loud (console.error,
// once) and recoverable (teleport back to the road) rather than fatal - the
// accountable-writes rule: a failed write must be visible, never silent.
function finite(x: number): boolean {
  return Number.isFinite(x)
}
function finiteV(v: THREE.Vector3): boolean {
  return finite(v.x) && finite(v.y) && finite(v.z)
}

/**
 * Normalised lateral grip vs slip angle. Rises linearly to 1.0 at the peak,
 * then eases DOWN to `slideFrac`. Past the peak, more angle = less grip:
 * that is the whole feel of a drift, and the plateau is why you can catch it.
 *
 * The plateau is per-axle - see TYRE.slideFrontFrac / slideRearFrac. It is the
 * difference between them that decides whether a slide converges or spins.
 */
function tyreCurve(slipAngle: number, slideFrac: number): number {
  const a = slipAngle < 0 ? -slipAngle : slipAngle
  if (a <= TYRE.peakSlip) return a / TYRE.peakSlip
  if (a >= TYRE.tailSlip) return slideFrac
  const t = (a - TYRE.peakSlip) / (TYRE.tailSlip - TYRE.peakSlip)
  const s = t * t * (3 - 2 * t)
  return 1 + (slideFrac - 1) * s
}

export interface VehiclePhysicsRefs {
  bodyRef: RefObject<RapierRigidBody | null>
  /** A group parented directly to the RigidBody's object3D - carries the INTERPOLATED pose. */
  visualRef: RefObject<THREE.Group | null>
  carRef: RefObject<CarBodyHandle | null>
}

export function useVehiclePhysics({ bodyRef, visualRef, carRef }: VehiclePhysicsRefs) {
  const { world, rapier } = useRapier()
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), [rapier])
  const lap = useMemo(() => new LapTracker(), [])

  // per-instance mutable state (refs, so nothing re-renders)
  const s = useRef({
    steerAngle: 0,
    gear: 1,
    rpm: RPM.idle,
    shiftTimer: 0,
    drifting: false,
    stepCount: 0,
    settleSteps: 6,
    uprightTimer: 0,
    resetPending: false,
    restartPending: false,
    restartTick: 0,
    latAccel: 0,
    longAccel: 0,
    beta: 0,
    nanReported: false,
    belowTerrainTimer: 0,
    massSet: false,
    visRoll: 0,
    visRollVel: 0,
    visPitch: 0,
    visPitchVel: 0,
  }).current

  useEffect(() => initInput(), [])

  // Reset request (R key / gamepad Y / anything calling requestReset).
  useEffect(
    () =>
      useGameStore.subscribe((state, prev) => {
        if (state.resetNonce !== prev.resetNonce) s.resetPending = true
      }),
    [s]
  )

  // ---------------------------------------------------------
  //  FIXED 60Hz PHYSICS STEP
  // ---------------------------------------------------------
  useBeforePhysicsStep(() => {
    const body = bodyRef.current
    if (!body) return

    // Mass properties, once. The chassis collider carries density 0, so the body's
    // entire mass, centre of mass and inertia tensor come from here - explicit and
    // tunable, rather than inferred from a box.
    if (!s.massSet) {
      s.massSet = true
      _rv.x = 0
      _rv.y = CHASSIS.comY
      _rv.z = 0
      body.setAdditionalMassProperties(
        CHASSIS.mass,
        _rv,
        CHASSIS.inertia,
        { x: 0, y: 0, z: 0, w: 1 },
        true
      )
    }

    // Rapier's addForce/addForceAtPoint/addTorque are PERSISTENT - they keep
    // applying every step until reset. Everything below is a fresh, per-step
    // force, so wipe last step's accumulator first. Forgetting this hands the
    // car a permanent thruster and it leaves the atmosphere.
    body.resetForces(false)
    body.resetTorques(false)

    updateInput(DT)

    // Shift+R / gamepad View: restart the run from the start line.
    if (s.restartTick !== restartSignal.nonce) {
      s.restartTick = restartSignal.nonce
      s.restartPending = true
    }
    if (s.restartPending) {
      s.restartPending = false
      s.resetPending = false // a restart supersedes any queued reset
      restartAtSpawn(body)
      // Same lap bookkeeping as a reset: void the lap in progress, disarm timing.
      // bestLapMs is never touched - a restart is not amnesia.
      lap.onTeleport(performance.now())
      vehicleSignals.resetTick++
      s.settleSteps = 4
      s.uprightTimer = 0
      s.belowTerrainTimer = 0
      telemetry.impact = 0
      return
    }

    if (s.resetPending) {
      s.resetPending = false
      teleportToRoad(body, s)
      lap.onTeleport(performance.now())
      vehicleSignals.resetTick++
      s.settleSteps = 4 // suppress the impact detector while the solver settles
      s.uprightTimer = 0
      s.belowTerrainTimer = 0
      telemetry.impact = 0
      return
    }

    // ----- read body state (rapier allocates these four; nothing else does) -----
    const t = body.translation()
    const r = body.rotation()
    const lv = body.linvel()
    const av = body.angvel()
    const cm = body.worldCom()

    _pos.set(t.x, t.y, t.z)
    _q.set(r.x, r.y, r.z, r.w)
    _linvel.set(lv.x, lv.y, lv.z)
    _angvel.set(av.x, av.y, av.z)
    _com.set(cm.x, cm.y, cm.z)

    // The body itself has gone non-finite - something upstream (a NaN force, a NaN
    // terrain sample) already poisoned it. Recover before we feed it back to rapier.
    if (!finiteV(_pos) || !finiteV(_linvel) || !finiteV(_angvel) || !finite(_q.w)) {
      reportNaN(s, 'body state')
      teleportToRoad(body, s)
      vehicleSignals.resetTick++
      s.settleSteps = 4
      telemetry.impact = 0
      return
    }

    // Chassis basis. +Z forward, +Y up, +X the car's LEFT, so right = -X.
    _fwd.set(0, 0, 1).applyQuaternion(_q)
    _up.set(0, 1, 0).applyQuaternion(_q)
    _right.set(-1, 0, 0).applyQuaternion(_q)

    // ----- impact: |dv| in one step. dv * mass IS the collision impulse. -----
    if (s.settleSteps > 0) {
      s.settleSteps--
    } else {
      const dv = _tmp.subVectors(_linvel, _prevLinvel).length()
      const hit = clamp((dv - STATE.impactThreshold) / STATE.impactRange, 0, 1)
      if (hit > telemetry.impact) telemetry.impact = hit
    }
    _prevLinvel.copy(_linvel)

    const speed = Math.hypot(_linvel.x, _linvel.z)
    const speedKmh = speed * 3.6
    const vLongCar = _linvel.dot(_fwd)
    const vLatCar = _linvel.dot(_right)

    // Drift angle: + when the car is travelling to its own right, i.e. the nose is
    // pointing left of where it is actually going. Everything below reads this.
    const beta = speed > 1.5 ? Math.atan2(vLatCar, vLongCar) : 0
    s.beta = beta

    // Counter-steering means turning the nose BACK toward the velocity vector. Since
    // beta > 0 needs a right-hand yaw, and input.steer is positive-right, that is
    // simply sign(steer) === sign(beta). Steering the other way feeds the slide.
    const counterSteer =
      Math.abs(beta) > ASSIST.counterSteerBeta &&
      Math.abs(input.steer) > 0.15 &&
      Math.sign(input.steer) === Math.sign(beta)

    // ----- steering: constant-g rack, rate limited -----
    // Full lock always commands the same lateral acceleration, whatever the speed.
    // See STEERING.latLimitG - this is the whole fix for "uncontrollable at 120".
    const gCap =
      (STEERING.wheelbase * STEERING.latLimitG * 9.81 * steeringGain()) /
      Math.max(speed * speed, 1)
    let limit = Math.min(STEERING.maxAngleLow, Math.max(STEERING.minAngle, gCap))
    // The rack re-opens only to CATCH a slide, never to feed one.
    if (s.drifting && counterSteer) limit = Math.max(limit, STEERING.driftAngle)
    // input.steer is -1..1 with LEFT negative; a positive road-wheel angle steers left.
    const steerTarget = -input.steer * limit
    const maxDelta = STEERING.rackRate * DT
    s.steerAngle += clamp(steerTarget - s.steerAngle, -maxDelta, maxDelta)

    // ----- throttle / brake / reverse -----
    const grip = CONFIG.grip
    const vTop = CONFIG.topSpeedKmh / 3.6
    let brakeCmd = input.brake
    let engineTotal = 0
    let reversing = false

    if (input.brake > 0.05 && input.throttle < 0.1 && vLongCar < 0.6) {
      reversing = true
      brakeCmd = 0
      if (Math.abs(vLongCar) * 3.6 < DRIVE.reverseTopKmh) {
        engineTotal = -input.brake * DRIVE.reverseForce
      }
    } else {
      const sf = clamp(vLongCar / vTop, 0, 1.3)
      const powerCurve = clamp(1 - DRIVE.powerFade * sf * sf, 0, 1)
      engineTotal = input.throttle * DRIVE.maxForce * CONFIG.enginePower * powerCurve
    }

    const brakeTotal = DRIVE.brakeForce * CONFIG.brakeStrength
    const brakeFrontWheel = (brakeTotal * DRIVE.brakeFrontBias) / 2
    const brakeRearWheel = (brakeTotal * (1 - DRIVE.brakeFrontBias)) / 2
    const quarterMass = CHASSIS.mass / 4

    // =========================================================
    //  PASS A - raycast + spring/damper
    // =========================================================
    let groundedCount = 0
    for (let i = 0; i < WHEEL_COUNT; i++) {
      _anchor.copy(anchorsLocal[i]).applyQuaternion(_q).add(_pos)

      ray.origin.x = _anchor.x
      ray.origin.y = _anchor.y
      ray.origin.z = _anchor.z
      ray.dir.x = -_up.x
      ray.dir.y = -_up.y
      ray.dir.z = -_up.z

      const hit = world.castRay(
        ray,
        RAY_LENGTH,
        true,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        body
      )

      if (!hit) {
        grounded[i] = false
        compression[i] = 0
        suspForce[i] = 0
        rayHit[i] = RAY_LENGTH
        continue
      }

      grounded[i] = true
      groundedCount++
      rayHit[i] = hit.timeOfImpact
      compression[i] = clamp(RAY_LENGTH - hit.timeOfImpact, 0, WHEEL.restLength)

      // contact patch = anchor projected down the ray
      contactPts[i].copy(_up).multiplyScalar(-hit.timeOfImpact).add(_anchor)

      // velocity of the chassis at the contact patch: v + w x r
      _arm.subVectors(contactPts[i], _com)
      _pointVel.crossVectors(_angvel, _arm).add(_linvel)

      // Positive = the corner is extending, negative = compressing.
      const suspVel = _pointVel.dot(_up)
      const damp = suspVel < 0 ? SUSPENSION.dampCompress : SUSPENSION.dampRebound
      const f = SUSPENSION.stiffness * compression[i] - damp * suspVel
      // A suspension can push, never pull.
      suspForce[i] = clamp(f, 0, SUSPENSION.maxForce)
    }

    // =========================================================
    //  PASS B - anti-roll bars
    //  Push the loaded (outside) corner up and unload the inside one.
    //  Keeps the car flat enough to steer, still lets the body lean.
    // =========================================================
    if (grounded[0] || grounded[1]) {
      const dF = (compression[0] - compression[1]) * SUSPENSION.antiRollFront
      suspForce[0] = clamp(suspForce[0] + dF, 0, SUSPENSION.maxForce)
      suspForce[1] = clamp(suspForce[1] - dF, 0, SUSPENSION.maxForce)
    }
    if (grounded[2] || grounded[3]) {
      const dR = (compression[2] - compression[3]) * SUSPENSION.antiRollRear
      suspForce[2] = clamp(suspForce[2] + dR, 0, SUSPENSION.maxForce)
      suspForce[3] = clamp(suspForce[3] - dR, 0, SUSPENSION.maxForce)
    }

    // ----- limited-slip diff: feed the torque to where the load is -----
    // A flat 50/50 split hands the unloaded inside rear as much torque as the loaded
    // outside one, so mid-corner the inside wheel saturates its friction circle,
    // spends its lateral grip on spinning, and the tail snaps. Biasing by load makes
    // that a slide you can feel arriving instead of one that arrives.
    const rearLoad = suspForce[2] + suspForce[3]
    const shareRL =
      rearLoad > 1
        ? clamp(suspForce[2] / rearLoad, DRIVE.torqueBiasMin, DRIVE.torqueBiasMax)
        : 0.5
    driveShare[2] = shareRL
    driveShare[3] = 1 - shareRL

    // =========================================================
    //  PASS C - tyres, friction circle, apply
    // =========================================================
    _tyreSum.set(0, 0, 0)
    const cosS = Math.cos(s.steerAngle)
    const sinS = Math.sin(s.steerAngle)

    for (let i = 0; i < WHEEL_COUNT; i++) {
      const isFront = i < 2
      const isRear = !isFront

      // steered wheel frame: rotate the chassis basis about `up` by steerAngle
      if (isFront) {
        wheelFwds[i].copy(_fwd).multiplyScalar(cosS).addScaledVector(_right, -sinS).normalize()
        wheelRights[i].copy(_right).multiplyScalar(cosS).addScaledVector(_fwd, sinS).normalize()
      } else {
        wheelFwds[i].copy(_fwd)
        wheelRights[i].copy(_right)
      }

      if (!grounded[i]) {
        latSlip[i] = 0
        longClip[i] = 0
        driving[i] = false
        continue
      }

      const load = suspForce[i]

      _arm.subVectors(contactPts[i], _com)
      _pointVel.crossVectors(_angvel, _arm).add(_linvel)
      // flatten the contact velocity into the ground plane
      _ground.copy(_pointVel).addScaledVector(_up, -_pointVel.dot(_up))

      const vLong = _ground.dot(wheelFwds[i])
      const vLat = _ground.dot(wheelRights[i])

      // ----- lateral: slip angle -> curve -> force -----
      const denom = Math.max(Math.abs(vLong), TYRE.slipSpeedFloor)
      const alpha = Math.atan2(Math.abs(vLat), denom)
      let mu = (isFront ? TYRE.muFront : TYRE.muRear) * grip
      if (isRear && input.handbrake) mu *= TYRE.handbrakeGrip

      const maxF = mu * load
      const curveVal = tyreCurve(alpha, isFront ? TYRE.slideFrontFrac : TYRE.slideRearFrac)
      let fLat = -Math.sign(vLat) * maxF * curveVal
      if (speed < 2) fLat -= vLat * load * ASSIST.lowSpeedLateral

      latSlip[i] = clamp((alpha - TYRE.peakSlip) / (TYRE.tailSlip - TYRE.peakSlip), 0, 1)

      // ----- longitudinal: drive + brake + rolling resistance -----
      const driveHere = isRear ? engineTotal * driveShare[i] : 0
      let fLong = driveHere
      driving[i] = isRear && Math.abs(driveHere) > 1

      const brakeHere = brakeCmd * (isFront ? brakeFrontWheel : brakeRearWheel)
      const hbHere = isRear && input.handbrake ? DRIVE.handbrakeForce : 0
      const brakeF = brakeHere + hbHere
      if (brakeF > 0) {
        // Never brake past a standstill: cap the impulse at what stops this corner.
        const cap = Math.min(brakeF, (Math.abs(vLong) * quarterMass) / DT)
        fLong -= Math.sign(vLong) * cap
      }
      fLong -= Math.sign(vLong) * TYRE.rollingResistance * load

      // ----- friction circle -----
      // The tyre has ONE budget for grip. Spend it on acceleration and there is
      // less for cornering: this single clamp is where power-oversteer comes from.
      const requestedLong = Math.abs(fLong)
      const mag = Math.hypot(fLong, fLat)
      if (mag > maxF && mag > 1e-4) {
        const scale = maxF / mag
        fLong *= scale
        fLat *= scale
      }
      const availableLong = Math.sqrt(Math.max(0, maxF * maxF - fLat * fLat))
      longClip[i] = clamp((requestedLong - availableLong) / Math.max(availableLong, 500), 0, 1)

      // ----- apply: suspension along up, tyre in the ground plane -----
      _force
        .copy(_up)
        .multiplyScalar(load)
        .addScaledVector(wheelFwds[i], fLong)
        .addScaledVector(wheelRights[i], fLat)

      _tmp.set(0, 0, 0).addScaledVector(wheelFwds[i], fLong).addScaledVector(wheelRights[i], fLat)
      _tyreSum.add(_tmp)

      // Last gate before rapier. A non-finite force here would panic the WASM.
      if (!finiteV(_force) || !finiteV(contactPts[i])) {
        reportNaN(s, `wheel ${i} force`)
        s.resetPending = true
        continue
      }

      _rv.x = _force.x
      _rv.y = _force.y
      _rv.z = _force.z
      _rp.x = contactPts[i].x
      _rp.y = contactPts[i].y
      _rp.z = contactPts[i].z
      body.addForceAtPoint(_rv, _rp, true)
    }

    // body-frame accelerations, for the visual roll / pitch springs
    s.latAccel = _tyreSum.dot(_right) / CHASSIS.mass
    s.longAccel = _tyreSum.dot(_fwd) / CHASSIS.mass

    // ----- aero -----
    const v2 = _linvel.lengthSq()
    if (v2 > 0.01) {
      const dragMag = AERO.drag * Math.sqrt(v2)
      _rv.x = -_linvel.x * dragMag
      _rv.y = -_linvel.y * dragMag
      _rv.z = -_linvel.z * dragMag
      body.addForce(_rv, true)
    }
    if (groundedCount > 0) {
      const down = AERO.downforce * speed * speed
      _rv.x = -_up.x * down
      _rv.y = -_up.y * down
      _rv.z = -_up.z * down
      body.addForce(_rv, true)
    }

    const airborne = groundedCount === 0

    // Does the player MEAN to be sideways? The handbrake says yes outright. Steering
    // says yes ONLY if it is a counter-steer - that is a driver holding a slide.
    // Steering INTO the slide is a player who has lost the car (or a kid who just
    // wants to turn and is holding the key down), so the safety net stays mostly on.
    // Throttle never counts: a kid holds throttle permanently, it says nothing.
    const steerMag = smoothstep(ASSIST.driftIntentLo, ASSIST.driftIntentHi, Math.abs(input.steer))
    const steerIntent = counterSteer ? steerMag : steerMag * ASSIST.steerIntoIntent
    const wantsDrift = Math.max(input.handbrake ? 1 : 0, steerIntent)
    const assistGain = 1 - wantsDrift

    // ----- yaw stability: light hand on the tiller; released when the player asks
    //       for a slide, and firmed right up when they have let go mid-slide. -----
    const yawRate = _angvel.dot(_up)
    const yawK = s.drifting
      ? ASSIST.yawDampDrift + (ASSIST.yawDampRecover - ASSIST.yawDampDrift) * assistGain
      : ASSIST.yawDamp
    _rv.x = -_up.x * yawRate * yawK
    _rv.y = -_up.y * yawRate * yawK
    _rv.z = -_up.z * yawRate * yawK
    body.addTorque(_rv, true)

    // ----- drift recovery: restoring torque toward the velocity vector -----
    // Damping alone only fights yaw RATE, so a slide that is already rotating
    // slowly still marches to 180deg. This is the missing spring: it pulls the
    // nose back onto the direction of travel, in proportion to how far off it is.
    // Zero while the player is asking for a drift, zero in a reverse manoeuvre,
    // zero in the air, zero below walking pace.
    if (!airborne && !reversing && assistGain > 0.01 && speed > ASSIST.assistSpeedLo) {
      // `beta` was measured at the top of the step: + means the car is travelling to
      // its own right, so the nose must yaw right to line back up.
      const mag = Math.abs(beta)
      if (mag > ASSIST.driftDeadband) {
        const over = Math.sign(beta) * Math.min(mag - ASSIST.driftDeadband, 1.2)
        const ramp = smoothstep(ASSIST.assistSpeedLo, ASSIST.assistSpeedHi, speed)
        const tq = clamp(
          -ASSIST.driftRestore * over * assistGain * ramp,
          -ASSIST.driftRestoreMax,
          ASSIST.driftRestoreMax
        )
        _rv.x = _up.x * tq
        _rv.y = _up.y * tq
        _rv.z = _up.z * tq
        body.addTorque(_rv, true)
      }
    }

    // ----- air control: minimal. Enough to straighten a landing, not to fly. -----
    if (airborne) {
      const pitchT = (input.throttle - input.brake) * ASSIST.airPitch
      const yawT = -input.steer * ASSIST.airYaw
      _rv.x = _right.x * pitchT + AXIS_Y.x * yawT - _angvel.x * ASSIST.airAngularDamp * 100
      _rv.y = _right.y * pitchT + AXIS_Y.y * yawT - _angvel.y * ASSIST.airAngularDamp * 100
      _rv.z = _right.z * pitchT + AXIS_Y.z * yawT - _angvel.z * ASSIST.airAngularDamp * 100
      body.addTorque(_rv, true)
    }

    // =========================================================
    //  TELEMETRY
    // =========================================================
    const rearLat = (latSlip[2] + latSlip[3]) * 0.5
    const frontLat = (latSlip[0] + latSlip[1]) * 0.5
    // Longitudinal saturation (wheelspin under power, lock-up under brakes) stays
    // PRIVATE: it drives the rev needle and the wheel-spin visuals, and nothing else.
    // It must never reach telemetry.slip - see below.
    let longSlip = 0
    for (let i = 0; i < WHEEL_COUNT; i++) if (longClip[i] > longSlip) longSlip = longClip[i]

    s.drifting =
      speed > STATE.driftSpeed &&
      (rearLat > STATE.driftSlip || (input.handbrake && speed > STATE.driftSpeed - 1))

    telemetry.speedKmh = speedKmh
    telemetry.throttle = input.throttle
    telemetry.brake = input.brake
    telemetry.steer = input.steer
    telemetry.handbrake = input.handbrake
    // telemetry.slip means LATERAL SLIDE - the tail stepping out - and nothing else.
    // Its consumers are tyre smoke and skid audio, and both are lying if it lights
    // up during straight-line braking. Rear-biased, because that is what a slide is.
    telemetry.slip = airborne
      ? telemetry.slip * 0.9
      : clamp(Math.max(rearLat, frontLat * 0.55), 0, 1)
    telemetry.drifting = s.drifting && !airborne
    telemetry.airborne = airborne

    updateGearAndRpm(s, speedKmh, reversing, longSlip)
    telemetry.gear = reversing ? -1 : s.gear
    telemetry.rpm = s.rpm

    carVisual.brake = input.brake
    carVisual.reversing = reversing

    // ----- wheel visuals -----
    for (let i = 0; i < WHEEL_COUNT; i++) {
      const w = carVisual.wheels[i]
      w.contact = grounded[i]
      w.compression = compression[i] / WHEEL.restLength
      w.steer = i < 2 ? s.steerAngle : 0
      w.position.set(
        anchorsLocal[i].x,
        anchorsLocal[i].y - (rayHit[i] - WHEEL.radius),
        anchorsLocal[i].z
      )

      let target: number
      if (!grounded[i]) {
        target = wheelOmega[i] * 0.985
      } else if (i >= 2 && input.handbrake) {
        target = 0 // locked rears - the visual half of a handbrake turn
      } else {
        target = _linvel.dot(wheelFwds[i]) / WHEEL.radius
        if (driving[i] && longClip[i] > 0) target *= 1 + longClip[i] * 1.1
        else if (brakeCmd > 0.1 && longClip[i] > 0) target *= 1 - Math.min(longClip[i], 0.9)
      }
      wheelOmega[i] = approach(wheelOmega[i], target, VISUAL.spinRate, DT)
      w.spin += wheelOmega[i] * DT
    }

    // ----- road / lap (allocating + O(n), so 12Hz not 60Hz) -----
    s.stepCount++
    if (s.stepCount % STATE.roadQueryEverySteps === 0) {
      const rp = nearestRoadPoint(_pos.x, _pos.z)
      const d = Math.hypot(_pos.x - rp.point.x, _pos.z - rp.point.z)
      telemetry.onRoad = d <= ROAD_WIDTH / 2 + 0.6
      // Same query feeds lap validity: sector checkpoints off `rp.t`, dirty
      // accounting off `onRoad`. Costs nothing beyond what onRoad already paid.
      lap.update(rp.t, speedKmh, performance.now(), telemetry.onRoad)
    }

    // ----- auto reset: fell off the world, or landed on the roof -----
    if (_pos.y < STATE.fallY) {
      s.resetPending = true
    } else if (_up.y < 0.05 && speed < 4) {
      s.uprightTimer += DT
      if (s.uprightTimer > STATE.upsideDownSeconds) s.resetPending = true
    } else {
      s.uprightTimer = 0
    }

    // ----- auto reset: tunnelled THROUGH the terrain -----
    // Rapier heightfields are infinitely thin. A fast enough descent skips the
    // surface between two steps and the car ends up under the world, sat on the
    // catch floor, stuck. Sampled at 4Hz because getTerrainHeight is O(n) and
    // allocates; sustained for half a second so a legitimate dip under an
    // overhanging rock or a bridge cannot trip it.
    if (s.stepCount % STATE.belowTerrainEverySteps === 0) {
      const ground = getTerrainHeight(_pos.x, _pos.z)
      const buried = finite(ground) && _pos.y < ground - STATE.belowTerrainDepth
      if (buried) {
        s.belowTerrainTimer += (STATE.belowTerrainEverySteps * 1) / 60
        if (s.belowTerrainTimer >= STATE.belowTerrainSeconds) {
          if (import.meta.env.DEV) {
            console.info(
              `[vehicle] below terrain by ${(ground - _pos.y).toFixed(1)}m - tunnelled through the heightfield, resetting`
            )
          }
          s.resetPending = true
          s.belowTerrainTimer = 0
        }
      } else {
        s.belowTerrainTimer = 0
      }
    }

    if (import.meta.env.DEV && s.stepCount === 3) {
      // Mass properties only land after rapier's first step, so report them here.
      const cm0 = body.worldCom()
      console.info(
        `[vehicle] mass=${body.mass().toFixed(0)}kg com=(${cm0.x.toFixed(2)}, ${cm0.y.toFixed(2)}, ${cm0.z.toFixed(2)})`
      )
    }

    vehicleSignals.ready = true
  })

  // ---------------------------------------------------------
  //  RENDER FRAME - read the INTERPOLATED pose, drive the mesh
  // ---------------------------------------------------------
  useFrame((_, dt) => {
    const obj = visualRef.current
    if (!obj) return

    // The RigidBody's object3D carries the interpolated pose (rapier's
    // fixed-step -> render-time blend). Reading the raw physics pose here
    // would hand the camera a 60Hz staircase.
    obj.getWorldPosition(telemetry.carPosition)
    obj.getWorldQuaternion(telemetry.carQuaternion)
    telemetry.carVelocity.copy(_linvel)

    // impact decays back to zero
    telemetry.impact = Math.max(0, telemetry.impact - STATE.impactDecay * dt)

    // Visual body roll / pitch - a critically damped spring on top of the physics
    // pose. Cornering left throws the body to the right; throttle lifts the nose.
    const rollTarget = clamp(-s.latAccel * VISUAL.rollGain, -VISUAL.rollMax, VISUAL.rollMax)
    const pitchTarget = clamp(s.longAccel * VISUAL.pitchGain, -VISUAL.pitchMax, VISUAL.pitchMax)
    const w = VISUAL.omega
    const h = Math.min(dt, 1 / 30)
    s.visRollVel += (-2 * w * s.visRollVel - w * w * (s.visRoll - rollTarget)) * h
    s.visRoll += s.visRollVel * h
    s.visPitchVel += (-2 * w * s.visPitchVel - w * w * (s.visPitch - pitchTarget)) * h
    s.visPitch += s.visPitchVel * h
    carVisual.roll = s.visRoll
    carVisual.pitch = s.visPitch

    carRef.current?.sync()
  })
}

// ---------- gearbox ----------
// The gearbox is a fiction: there is no clutch, no torque curve, no wheel inertia.
// It exists so the engine note rises through a gear, drops on the shift, and rises
// again - because that is the sound of going fast.
function updateGearAndRpm(
  s: { gear: number; rpm: number; shiftTimer: number },
  speedKmh: number,
  reversing: boolean,
  longSlip: number
) {
  const kmh = Math.abs(speedKmh)

  if (s.shiftTimer > 0) s.shiftTimer -= DT

  let rpmTarget: number
  if (reversing) {
    rpmTarget = 0.15 + 0.65 * clamp(kmh / DRIVE.reverseTopKmh, 0, 1)
  } else {
    // Hysteresis on the downshift stops the box hunting at a constant speed.
    if (kmh > GEAR_TOP_KMH[s.gear - 1] && s.gear < GEAR_TOP_KMH.length) {
      s.gear++
      s.shiftTimer = RPM.shiftSeconds
    } else if (s.gear > 1 && kmh < GEAR_TOP_KMH[s.gear - 2] * RPM.downshiftHysteresis) {
      s.gear--
      s.shiftTimer = RPM.shiftSeconds
    }

    const lo = s.gear === 1 ? 0 : GEAR_TOP_KMH[s.gear - 2]
    const hi = GEAR_TOP_KMH[s.gear - 1]
    // frac is allowed to run slightly negative: inside the downshift hysteresis
    // band the needle should sag below the gear's base, not pin flat and go mute.
    const frac = clamp((kmh - lo) / Math.max(hi - lo, 1), -0.19, 1)
    rpmTarget = Math.max(RPM.idle + 0.04, RPM.base + RPM.span * frac)

    if (kmh < 3) {
      // idling: the needle answers the throttle even standing still
      rpmTarget = RPM.idle + RPM.idleThrottle * telemetry.throttle + kmh * 0.02
    }
  }

  rpmTarget += longSlip * RPM.spinBoost
  if (s.shiftTimer > 0) rpmTarget *= RPM.shiftCut

  s.rpm = clamp(approach(s.rpm, clamp(rpmTarget, 0, 1), RPM.smoothing, DT), 0, 1)
}

// ---------- reset ----------
/** Loud once, never per-step: 60 identical errors a second bury their own cause. */
function reportNaN(s: { nanReported: boolean }, where: string) {
  if (s.nanReported) return
  s.nanReported = true
  console.error(
    `[vehicle] non-finite value at "${where}" - refusing to hand it to rapier, resetting to the road. ` +
      `Left unchecked this panics the physics WASM and every later call throws "recursive use of an object".`
  )
}

/**
 * Restart the run: back to the start line, facing down the straight, stopped.
 * `getSpawn()` is a pure function of the road spline, so this is the one teleport
 * that cannot depend on the car's (possibly poisoned) current position.
 */
function restartAtSpawn(body: RapierRigidBody) {
  const spawn = getSpawn()
  if (!finite(spawn.position.x) || !finite(spawn.position.y) || !finite(spawn.position.z)) return

  _rp.x = spawn.position.x
  _rp.y = spawn.position.y
  _rp.z = spawn.position.z
  body.setTranslation(_rp, true)

  _q.setFromAxisAngle(AXIS_Y, spawn.rotationY)
  body.setRotation(_q, true)

  _rv.x = 0
  _rv.y = 0
  _rv.z = 0
  body.setLinvel(_rv, true)
  body.setAngvel(_rv, true)
  body.resetForces(true)
  body.resetTorques(true)

  _prevLinvel.set(0, 0, 0)
  for (let i = 0; i < WHEEL_COUNT; i++) wheelOmega[i] = 0
}

function teleportToRoad(body: RapierRigidBody, s?: { nanReported: boolean }) {
  const t = body.translation()
  // A poisoned body gives a poisoned query. Fall back to the spawn, which is a
  // constant and cannot be NaN.
  const usable = finite(t.x) && finite(t.z)
  const rp = usable ? nearestRoadPoint(t.x, t.z) : null

  let px: number, py: number, pz: number, yaw: number
  if (rp && finiteV(rp.point) && finiteV(rp.tangent)) {
    px = rp.point.x
    py = rp.point.y + 1.0
    pz = rp.point.z
    yaw = Math.atan2(rp.tangent.x, rp.tangent.z)
  } else {
    if (s) reportNaN(s, 'nearestRoadPoint')
    const spawn = getSpawn()
    px = spawn.position.x
    py = spawn.position.y
    pz = spawn.position.z
    yaw = spawn.rotationY
  }

  // If even that is not finite there is nothing sane left to do; leave the body
  // alone rather than panic the WASM.
  if (!finite(px) || !finite(py) || !finite(pz) || !finite(yaw)) return

  _rp.x = px
  _rp.y = py
  _rp.z = pz
  body.setTranslation(_rp, true)

  _q.setFromAxisAngle(AXIS_Y, yaw)
  body.setRotation(_q, true)

  _rv.x = 0
  _rv.y = 0
  _rv.z = 0
  body.setLinvel(_rv, true)
  body.setAngvel(_rv, true)
  body.resetForces(true)
  body.resetTorques(true)

  _prevLinvel.set(0, 0, 0)
  for (let i = 0; i < WHEEL_COUNT; i++) wheelOmega[i] = 0
}
