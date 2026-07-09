// ============================================================
//  INPUT - analog first, last-touched-device wins
// ------------------------------------------------------------
//  Keyboard : WASD / arrows, Space = handbrake, R = reset
//  Gamepad  : left stick = steer, RT = throttle, LT = brake,
//             A = handbrake, Y = reset
//
//  Digital keys are attack/release smoothed so they never twitch.
//  Analog sticks run through a gentle response curve so small
//  movements stay small. Whichever device produced input most
//  recently owns the car - there is no setting for this.
//
//  updateInput(dt) is called once per PHYSICS step (fixed 60Hz),
//  which makes the smoothing deterministic and frame-rate proof.
// ============================================================

import { useGameStore } from './store'

export interface DriveInput {
  throttle: number //   0..1
  brake: number //      0..1
  steer: number //     -1..1, negative = left (matches telemetry.steer)
  handbrake: boolean
}

/** Smoothed input the vehicle actually consumes. Mutated in place, never replaced. */
export const input: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false }

/**
 * Scripted-drive channel (dev/DemoDrive). When `active`, updateInput() feeds these
 * values through the ANALOG path - the same code the gamepad uses - so an autopilot
 * exercises the real physics, not a shortcut. Human input is ignored while active
 * (R / Y reset still works, it is an event not a poll).
 */
export const inputOverride = {
  active: false,
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
}

// ---------- smoothing rates (per second) ----------
// Attack is faster than release on steer so the car answers instantly but
// self-centres lazily; flipping across centre is fastest of all, because that
// is a counter-steer and it has to be there NOW.
const STEER_ATTACK = 8
const STEER_RELEASE = 6
const STEER_FLIP = 14
const THROTTLE_ATTACK = 7
const THROTTLE_RELEASE = 10
const BRAKE_ATTACK = 11
const BRAKE_RELEASE = 14
// Analog axes barely need smoothing - just enough to kill stick noise.
const ANALOG_RATE = 26

const STICK_DEADZONE = 0.14
const TRIGGER_DEADZONE = 0.05

// ---------- device state ----------
const keys = { fwd: false, back: false, left: false, right: false, hand: false }
let device: 'keyboard' | 'gamepad' = 'keyboard'
let padResetPrev = false
let mounted = 0

function setDevice(d: 'keyboard' | 'gamepad') {
  if (device === d) return
  device = d
  useGameStore.getState().setInputDevice(d)
}

/** Exponential approach - frame-rate independent, never overshoots. */
function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

function deadzone(v: number, dz: number): number {
  const a = Math.abs(v)
  if (a <= dz) return 0
  return Math.sign(v) * ((a - dz) / (1 - dz))
}

/** Gentle response curve: x * |x|^0.5. Small stick movements stay small. */
function stickCurve(x: number): number {
  const a = Math.abs(x)
  return Math.sign(x) * a * Math.sqrt(a)
}

// ---------- keyboard ----------

function keyCode(e: KeyboardEvent): string {
  return e.code || e.key
}

function onKeyDown(e: KeyboardEvent) {
  if (e.repeat) return
  const c = keyCode(e)
  let handled = true
  switch (c) {
    case 'KeyW':
    case 'ArrowUp':
      keys.fwd = true
      break
    case 'KeyS':
    case 'ArrowDown':
      keys.back = true
      break
    case 'KeyA':
    case 'ArrowLeft':
      keys.left = true
      break
    case 'KeyD':
    case 'ArrowRight':
      keys.right = true
      break
    case 'Space':
      keys.hand = true
      break
    case 'KeyR':
      useGameStore.getState().requestReset()
      break
    default:
      handled = false
  }
  if (handled) {
    setDevice('keyboard')
    // Stop arrows/space scrolling the page out from under the game.
    if (c === 'Space' || c.startsWith('Arrow')) e.preventDefault()
  }
}

function onKeyUp(e: KeyboardEvent) {
  switch (keyCode(e)) {
    case 'KeyW':
    case 'ArrowUp':
      keys.fwd = false
      break
    case 'KeyS':
    case 'ArrowDown':
      keys.back = false
      break
    case 'KeyA':
    case 'ArrowLeft':
      keys.left = false
      break
    case 'KeyD':
    case 'ArrowRight':
      keys.right = false
      break
    case 'Space':
      keys.hand = false
      break
  }
}

function onBlur() {
  keys.fwd = keys.back = keys.left = keys.right = keys.hand = false
}

/** Attach listeners. Returns a disposer. Safe under React StrictMode double-mount. */
export function initInput(): () => void {
  mounted++
  if (mounted === 1) {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
  }
  return () => {
    mounted--
    if (mounted === 0) {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      onBlur()
    }
  }
}

// ---------- gamepad ----------

/**
 * Chrome only exposes a pad AFTER the player presses a button, and the snapshot is
 * stale unless polled - so this runs every step, not on an event.
 */
function readGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null
  const pads = navigator.getGamepads()
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i]
    if (p && p.connected) return p
  }
  return null
}

function padIsActive(p: Gamepad): boolean {
  if (Math.abs(p.axes[0] ?? 0) > 0.2 || Math.abs(p.axes[1] ?? 0) > 0.2) return true
  for (let i = 0; i < p.buttons.length; i++) {
    const b = p.buttons[i]
    if (b.pressed || b.value > 0.15) return true
  }
  return false
}

function buttonValue(p: Gamepad, index: number): number {
  const b = p.buttons[index]
  return b ? b.value : 0
}

// ---------- per-step update ----------

/** Poll devices, smooth, and write `input`. Call once per fixed physics step. */
export function updateInput(dt: number): void {
  // 1. Scripted drive wins outright - analog path, no smoothing games.
  if (inputOverride.active) {
    input.throttle = approach(input.throttle, clamp01(inputOverride.throttle), ANALOG_RATE, dt)
    input.brake = approach(input.brake, clamp01(inputOverride.brake), ANALOG_RATE, dt)
    input.steer = approach(input.steer, clampSteer(inputOverride.steer), ANALOG_RATE, dt)
    input.handbrake = inputOverride.handbrake
    return
  }

  // 2. Gamepad, if it is the live device (or if it just woke up).
  const pad = readGamepad()
  if (pad && padIsActive(pad)) setDevice('gamepad')

  if (pad) {
    // Reset is an edge, and works regardless of which device "owns" the car.
    const y = pad.buttons[3]?.pressed ?? false
    if (y && !padResetPrev) useGameStore.getState().requestReset()
    padResetPrev = y
  } else {
    padResetPrev = false
    if (device === 'gamepad') setDevice('keyboard')
  }

  if (device === 'gamepad' && pad) {
    const rawSteer = stickCurve(deadzone(pad.axes[0] ?? 0, STICK_DEADZONE))
    // Triggers are already analog - map them straight through.
    const rawThrottle = deadzone(buttonValue(pad, 7), TRIGGER_DEADZONE)
    const rawBrake = deadzone(buttonValue(pad, 6), TRIGGER_DEADZONE)
    input.steer = approach(input.steer, rawSteer, ANALOG_RATE, dt)
    input.throttle = approach(input.throttle, rawThrottle, ANALOG_RATE, dt)
    input.brake = approach(input.brake, rawBrake, ANALOG_RATE, dt)
    input.handbrake = pad.buttons[0]?.pressed ?? false
    return
  }

  // 3. Keyboard - digital in, analog out.
  const steerTarget = (keys.left ? -1 : 0) + (keys.right ? 1 : 0)
  let steerRate: number
  if (steerTarget === 0) steerRate = STEER_RELEASE
  else if (input.steer !== 0 && Math.sign(steerTarget) !== Math.sign(input.steer)) steerRate = STEER_FLIP
  else steerRate = STEER_ATTACK
  input.steer = approach(input.steer, steerTarget, steerRate, dt)
  if (Math.abs(input.steer) < 0.002) input.steer = 0

  const throttleTarget = keys.fwd ? 1 : 0
  input.throttle = approach(
    input.throttle,
    throttleTarget,
    throttleTarget > 0 ? THROTTLE_ATTACK : THROTTLE_RELEASE,
    dt
  )

  const brakeTarget = keys.back ? 1 : 0
  input.brake = approach(input.brake, brakeTarget, brakeTarget > 0 ? BRAKE_ATTACK : BRAKE_RELEASE, dt)

  input.handbrake = keys.hand
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function clampSteer(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v
}
