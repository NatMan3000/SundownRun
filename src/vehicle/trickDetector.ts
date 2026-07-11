// ============================================================
//  TRICK DETECTION - jumps, spins, flips, rolls, clean landings
// ------------------------------------------------------------
//  Hangs off the physics step exactly like the ghost recorder
//  (ghost.ts) and reports through the frozen contract seam in
//  core/tricks.ts: emitTrick() per landed trick, commitCombo()
//  with the chain total on a clean landing.
//
//  ONE AIR SESSION = ONE COMBO CHAIN. Takeoff (all four wheels
//  leave the ground) opens a session; the first wheel back down
//  closes it. Everything the car did in between is scored AT the
//  landing, not mid-air - which is the only way "a crash voids
//  the combo" can be honest: emitTrick already banks its points,
//  so we cannot award a 360 in the air and then un-award it when
//  the car lands on its roof. Score on touchdown, know the outcome.
//
//  WHY INTEGRATE ANGULAR RATE, not a quaternion delta. A trick is
//  a WINDING NUMBER - a 720 is two full turns, not zero. The delta
//  between takeoff and landing orientation only yields the NET
//  0..360, so a double spin reads as whatever fraction is left over.
//  Integrating the body-frame yaw / pitch / roll rate each step
//  counts the turns properly. It is also cheaper than quaternion
//  math: three dot products and three scalar adds per step, no
//  temps, no allocation - the ghost.ts standard.
//
//  HOT PATH: when the car is on the ground this is a single boolean
//  test and return. Airborne, it is the three dots above. The only
//  allocation anywhere is the label strings built on a landing, and
//  a landing is an event, not a frame - same posture as ghost.commit.
// ============================================================

import * as THREE from 'three'
import { CONFIG } from '../core/config'
import { telemetry } from '../core/telemetry'
import { commitCombo, emitTrick, wipeoutSession } from '../core/tricks'
import { DT } from './tuning'

const TWO_PI = Math.PI * 2
const RAD2DEG = 180 / Math.PI

// ---------- tuning: what counts, and what it is worth ----------

/** Below this hang time the whole session is a kerb bump - scored as nothing. */
const MIN_AIR_S = 0.4
/** up.y at the landing step. At/above this the car came down on its wheels. */
const UPRIGHT_MIN = 0.5

/** Air tier LABELS by hang time, highest first - the shout, not the score. */
const AIR_TIERS: ReadonlyArray<readonly [number, string]> = [
  [2.4, 'TO THE MOON'],
  [1.7, 'HUGE AIR'],
  [1.1, 'BIG AIR'],
  [0.6, 'AIR'],
]
/**
 * Air POINTS are continuous in hang time - every jump scores differently, and
 * quadratic growth means doubling your air more than doubles your points:
 * 0.6s = 20, 1.0s = 55, 1.5s = 124, 2.4s = 317.
 */
const AIR_PTS_PER_S2 = 55

const SPIN_HALF_PTS = 100 //  per 180 degrees of spin
const FLIP_PTS = 250 //       per full front/back flip
const ROLL_PTS = 250 //       per full barrel roll
/** Extra fraction of the chain total per trick beyond the first - chains pay off. */
const COMBO_RATE = 0.25

// ---------- live debug state (mutable singleton, DevTools reads it) ----------
// Same discipline as core/telemetry.ts and ghost.ts: mutate in place, never replace.
// Lets a checker watch the rotation build mid-air and prove detection without a HUD.
export const trickState = {
  airborne: false,
  airSeconds: 0,
  spinDeg: 0, //  signed degrees of yaw accumulated this air session
  flipDeg: 0, //  signed degrees of pitch (+ back, - front)
  rollDeg: 0, //  signed degrees of roll
}

// ---------- classification (pure - unit-testable without a physics step) ----------

export interface LandingTricks {
  /** How many distinct tricks qualified. Zero means "just a hop". */
  links: number
  airLabel: string
  airPoints: number
  spinLabel: string
  spinPoints: number
  flipLabel: string
  flipPoints: number
  rollLabel: string
  rollPoints: number
}

function multi(n: number, base: string): string {
  if (n <= 1) return base
  if (n === 2) return 'DOUBLE ' + base
  if (n === 3) return 'TRIPLE ' + base
  return `${n}x ${base}`
}

/**
 * Turn a finished air session (hang time + accumulated body-frame rotation, all
 * radians) into the tricks it earned. Pure: no side effects, so a headless test
 * can assert the taxonomy directly. Called once per landing, never per frame.
 */
export function classifyLanding(
  airSeconds: number,
  yaw: number,
  pitch: number,
  roll: number
): LandingTricks {
  let airLabel = ''
  let airPoints = 0
  for (let i = 0; i < AIR_TIERS.length; i++) {
    if (airSeconds >= AIR_TIERS[i][0]) {
      airLabel = AIR_TIERS[i][1]
      break
    }
  }
  // Points flow from the hang time itself, so no two jumps score alike.
  if (airLabel !== '') airPoints = Math.round(airSeconds * airSeconds * AIR_PTS_PER_S2)

  const spinHalves = Math.floor(Math.abs(yaw) / Math.PI)
  const spinPoints = spinHalves * SPIN_HALF_PTS
  const spinLabel = spinHalves > 0 ? `${spinHalves * 180} SPIN` : ''

  // + pitch rate lifts the nose (see the basis derivation in useVehiclePhysics):
  // nose-over-backwards is a backflip, nose-down-forwards is a front flip.
  const flipN = Math.floor(Math.abs(pitch) / TWO_PI)
  const flipPoints = flipN * FLIP_PTS
  const flipLabel = flipN > 0 ? multi(flipN, pitch < 0 ? 'FRONT FLIP' : 'BACKFLIP') : ''

  const rollN = Math.floor(Math.abs(roll) / TWO_PI)
  const rollPoints = rollN * ROLL_PTS
  const rollLabel = rollN > 0 ? multi(rollN, 'BARREL ROLL') : ''

  let links = 0
  if (airPoints > 0) links++
  if (spinPoints > 0) links++
  if (flipPoints > 0) links++
  if (rollPoints > 0) links++

  return {
    links,
    airLabel,
    airPoints,
    spinLabel,
    spinPoints,
    flipLabel,
    flipPoints,
    rollLabel,
    rollPoints,
  }
}

/** Emit a finished session's tricks through the contract. Only ever called for a
 *  landing that ended upright - a crash resolves to wipeoutSession() in the
 *  detector's recovery window instead, and never reaches here. */
function scoreLanding(airSeconds: number, yaw: number, pitch: number, roll: number): void {
  const r = classifyLanding(airSeconds, yaw, pitch, roll)
  if (r.links === 0) return // a nothing-hop: no trick, and so no combo to void either

  let combo = 0
  let total = 0
  if (r.airPoints > 0) {
    emitTrick(r.airLabel, r.airPoints, ++combo)
    total += r.airPoints
  }
  if (r.spinPoints > 0) {
    emitTrick(r.spinLabel, r.spinPoints, ++combo)
    total += r.spinPoints
  }
  if (r.flipPoints > 0) {
    emitTrick(r.flipLabel, r.flipPoints, ++combo)
    total += r.flipPoints
  }
  if (r.rollPoints > 0) {
    emitTrick(r.rollLabel, r.rollPoints, ++combo)
    total += r.rollPoints
  }

  // No participation prize for merely landing - the tricks themselves are the
  // score. The bonus only exists where chains do: a three-trick landing is worth
  // half again its parts.
  if (r.links >= 2) {
    const comboBonus = Math.round(total * COMBO_RATE * (r.links - 1))
    emitTrick(`COMBO x${r.links}!`, comboBonus, ++combo)
    total += comboBonus
  }

  commitCombo(total)
}

// ---------- the detector (singleton - there is one car) ----------

/** Grounded steps a scruffy landing gets to recover upright before it is a wipeout.
 *  Two wheels + a wobble is a save, not a crash - only SETTLING wrong ends the run. */
const RECOVER_STEPS = 45 // 0.75s at 60Hz

// ---------- drifting: the longer you hold it, the more it pays ----------
/** Shorter than this is cornering, not a drift worth shouting about. */
const DRIFT_MIN_S = 1.0
/** A drift may flicker (grip catches for a step or two) - gaps shorter than this
 *  stay part of the same drift instead of splitting it into two small ones. */
const DRIFT_GAP_STEPS = 24 // 0.4s
/** Points grow with the square of held time: 1s = 15, 2s = 60, 3s = 135, 5s = 375. */
const DRIFT_PTS_PER_S2 = 15
const DRIFT_TIERS: ReadonlyArray<readonly [number, string]> = [
  [7.0, 'ULTIMATE DRIFT'],
  [4.5, 'MEGA DRIFT'],
  [2.5, 'LONG DRIFT'],
  [1.0, 'DRIFT'],
]

class TrickDetector {
  private active = false
  private airSteps = 0
  private yaw = 0 //   accumulated body-frame rotation, radians
  private pitch = 0
  private roll = 0
  /** Landed dirty and the jury is out: >0 counts down the recovery window. */
  private pendingSteps = 0
  private pendingAirSeconds = 0
  /** up.y from the latest step - so cancel() can judge HOW the session ended. */
  private lastUpY = 1
  /** Steps of the drift being held right now (0 = not drifting). */
  private driftSteps = 0
  /** Steps since the drift last gripped - a short gap is still the same drift. */
  private driftGap = 0

  /** Fed each step from telemetry.drifting. Airborne steps count as gap, so a
   *  drift into a jump banks when the gap runs out, never merging across the air. */
  private stepDrift(drifting: boolean): void {
    if (drifting) {
      this.driftSteps++
      this.driftGap = 0
      return
    }
    if (this.driftSteps === 0) return
    this.driftGap++
    if (this.driftGap < DRIFT_GAP_STEPS) return
    const heldS = this.driftSteps * DT
    this.driftSteps = 0
    this.driftGap = 0
    if (heldS < DRIFT_MIN_S) return
    for (let i = 0; i < DRIFT_TIERS.length; i++) {
      if (heldS >= DRIFT_TIERS[i][0]) {
        emitTrick(DRIFT_TIERS[i][1], Math.round(heldS * heldS * DRIFT_PTS_PER_S2), 1)
        return
      }
    }
  }

  /**
   * Abandon the session in progress without scoring it. Called from every teleport
   * path (reset / restart / NaN recovery) - the car did not really land, so a jump
   * that a reset interrupts must never post a phantom trick on the next grounded step.
   *
   * EXCEPT: a reset that arrives when the car is DOWN counts as the wipeout it
   * is. Two ways to be down: (a) a dirty landing still inside its recovery
   * window, and (b) sitting inverted with the wheels off the ground - a car on
   * its roof never registers a touchdown at all (airborne = zero wheels grounded,
   * and the rays point at the sky), so the session stays "active" until the reset
   * arrives. Without (b), roof landings escape unpunished - the phantom that made
   * wipeouts vanish entirely in playtest round 2.
   */
  cancel(): void {
    if (this.pendingSteps > 0 || (this.active && this.lastUpY < UPRIGHT_MIN)) wipeoutSession()
    this.active = false
    this.airSteps = 0
    this.yaw = 0
    this.pitch = 0
    this.roll = 0
    this.pendingSteps = 0
    this.pendingAirSeconds = 0
    this.driftSteps = 0 // a teleport mid-drift banks nothing
    this.driftGap = 0
    trickState.airborne = false
    trickState.airSeconds = 0
    trickState.spinDeg = 0
    trickState.flipDeg = 0
    trickState.rollDeg = 0
  }

  /**
   * Fed once per 60Hz physics step with the current airborne flag and the chassis
   * basis + world-frame angular velocity. Grounded: one boolean and out. Airborne:
   * three dot products and three adds. No allocation until a landing is scored.
   */
  update(
    airborne: boolean,
    up: THREE.Vector3,
    fwd: THREE.Vector3,
    right: THREE.Vector3,
    angvel: THREE.Vector3
  ): void {
    if (!CONFIG.tricks) {
      if (this.active) this.cancel()
      return
    }

    this.lastUpY = up.y
    this.stepDrift(!airborne && telemetry.drifting)

    if (airborne) {
      if (!this.active) {
        this.active = true
        // A bounce off a dirty landing continues the SAME session - accumulators
        // survive, so a tumble that recovers mid-air still scores as one trick.
        if (this.pendingSteps === 0) {
          this.airSteps = 0
          this.yaw = 0
          this.pitch = 0
          this.roll = 0
        }
        this.pendingSteps = 0
        this.pendingAirSeconds = 0
      }
      this.airSteps++
      // Body-frame rates: yaw about the car's up (spin), pitch about its right
      // (flip), roll about its forward (barrel roll). Integrated => turns, not angle.
      this.yaw += angvel.dot(up) * DT
      this.pitch += angvel.dot(right) * DT
      this.roll += angvel.dot(fwd) * DT
      trickState.airborne = true
      trickState.airSeconds = this.airSteps * DT
      trickState.spinDeg = this.yaw * RAD2DEG
      trickState.flipDeg = this.pitch * RAD2DEG
      trickState.rollDeg = this.roll * RAD2DEG
      return
    }

    // Just touched down. Upright: close the session and score it. Dirty: hold the
    // verdict open for a recovery window - two wheels and a wobble is a save.
    if (this.active) {
      const airSeconds = this.airSteps * DT
      if (airSeconds < MIN_AIR_S) {
        this.settle()
        return
      }
      if (up.y >= UPRIGHT_MIN) {
        const yaw = this.yaw
        const pitch = this.pitch
        const roll = this.roll
        this.settle()
        scoreLanding(airSeconds, yaw, pitch, roll)
        return
      }
      this.active = false
      this.pendingSteps = RECOVER_STEPS
      this.pendingAirSeconds = airSeconds
      trickState.airborne = false
      return
    }

    // Grounded with a verdict pending: recover upright in time and the trick scores
    // clean; settle wrong (or need a reset - see cancel) and the session wipes out.
    if (this.pendingSteps > 0) {
      if (up.y >= UPRIGHT_MIN) {
        const airSeconds = this.pendingAirSeconds
        const yaw = this.yaw
        const pitch = this.pitch
        const roll = this.roll
        this.settle()
        scoreLanding(airSeconds, yaw, pitch, roll)
        return
      }
      this.pendingSteps--
      if (this.pendingSteps === 0) {
        this.settle()
        wipeoutSession()
      }
    }
  }

  /** Quietly zero everything - the no-verdict version of cancel(). */
  private settle(): void {
    this.active = false
    this.airSteps = 0
    this.yaw = 0
    this.pitch = 0
    this.roll = 0
    this.pendingSteps = 0
    this.pendingAirSeconds = 0
    trickState.airborne = false
    trickState.airSeconds = 0
    trickState.spinDeg = 0
    trickState.flipDeg = 0
    trickState.rollDeg = 0
  }
}

export const trickDetector = new TrickDetector()
