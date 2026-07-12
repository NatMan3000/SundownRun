// ============================================================
//  CAMERA MODES
// ------------------------------------------------------------
//  Session state, not config. CONFIG.cameraDistance / cameraHeight /
//  fovBase / fovMax remain the CHASE tune - the knobs Josh edits -
//  and the other two modes are expressed relative to their own
//  numbers. Cycled with C (keyboard) or RB (gamepad); the mode is
//  never persisted, so every reload starts behind the car.
// ============================================================

import { CONFIG } from '../core/config'

export type CameraMode = 'chase' | 'close' | 'bonnet'

export const CAMERA_MODES: readonly CameraMode[] = ['chase', 'close', 'bonnet'] as const

export interface CameraRig {
  /** 'orbit' rides behind the car; 'mount' is bolted to the chassis. */
  kind: 'orbit' | 'mount'
  /** orbit: metres behind / above. mount: chassis-local position. */
  distance: number
  height: number
  mountY: number
  mountZ: number
  /** How far the camera swings from the nose toward the VELOCITY vector. */
  velocityBlendBase: number
  velocityBlendSlip: number
  /** Look target: ahead of the car, further at speed. */
  lookAhead: number
  lookAheadSpeedGain: number
  lookHeight: number
  /** Spring catch-up times, seconds. Smaller = tighter. */
  posSmooth: number
  posSmoothDrift: number
  lookSmooth: number
  /** Speed shake and impact kick, scaled per mode. */
  shakeScale: number
  /** Degrees added to the speed-driven FOV. */
  fovOffset: number
  /** 1 = keep the camera above the terrain. 0 = it is bolted to the car, leave it. */
  groundClamp: number
  /**
   *  Velocity lead, 0..1. A critically damped spring chasing a target that moves at
   *  constant velocity settles a fixed distance BEHIND it - about `v * smoothTime`.
   *  For an orbit rig that lag is the feel. For a rig bolted to the nose it is a bug:
   *  at 190 km/h the bonnet cam would trail 2.4 m and end up inside the cabin. Adding
   *  `v * smoothTime` back onto the target cancels the first-order lag exactly, so the
   *  spring is left absorbing only the accelerations and jitter - which is the point.
   */
  velocityLead: number
}

/**
 * CHASE is the constitution's camera and the one CONFIG describes.
 * CLOSE drops low and tight and leans harder on the velocity vector, so a drift
 * fills the screen. BONNET sits on the nose: no orbit at all, just the road coming
 * at you, with the shake pulled back because at eye level it is much louder.
 */
export const CAMERA_RIGS: Record<CameraMode, CameraRig> = {
  chase: {
    kind: 'orbit',
    distance: CONFIG.cameraDistance,
    height: CONFIG.cameraHeight,
    mountY: 0,
    mountZ: 0,
    velocityBlendBase: 0.35,
    velocityBlendSlip: 0.5,
    lookAhead: 2,
    lookAheadSpeedGain: 0.06,
    lookHeight: 0.9,
    posSmooth: 0.16,
    posSmoothDrift: 0.12,
    lookSmooth: 0.1,
    shakeScale: 1,
    fovOffset: 0,
    groundClamp: 1,
    velocityLead: 0,
  },
  close: {
    kind: 'orbit',
    distance: 4.2,
    height: 0.9,
    mountY: 0,
    mountZ: 0,
    // Wider velocity blend: at 1.0 the camera sits square behind where the car is
    // actually travelling, so a slide reads as the whole car swinging across frame.
    velocityBlendBase: 0.5,
    velocityBlendSlip: 0.62,
    lookAhead: 3.4,
    lookAheadSpeedGain: 0.075,
    lookHeight: 0.75,
    posSmooth: 0.11,
    posSmoothDrift: 0.085,
    lookSmooth: 0.08,
    shakeScale: 1.15,
    fovOffset: 2,
    groundClamp: 1,
    velocityLead: 0,
  },
  bonnet: {
    kind: 'mount',
    distance: 0,
    height: 0,
    // Chassis-local, just above the nose. The road surface is local y = -0.542.
    mountY: 0.5, //0.32
    mountZ: 0.0, //1.5
    velocityBlendBase: 0,
    velocityBlendSlip: 0,
    lookAhead: 14,
    lookAheadSpeedGain: 0.25,
    lookHeight: 0.1,
    // Springs, not a weld: short enough to feel bolted on, long enough that a kerb
    // strike does not punch you in the eye.
    posSmooth: 0.045,
    posSmoothDrift: 0.045,
    lookSmooth: 0.05,
    shakeScale: 0.45,
    fovOffset: 6,
    groundClamp: 0,
    velocityLead: 1,
  },
}

/** How long a mode change takes to ease across. */
export const CAMERA_TRANSITION_S = 0.4

/** Live camera state. Mutable singleton, same discipline as core/telemetry.ts. */
export const cameraState = {
  index: 0,
  mode: 'chase' as CameraMode,
  /** The mode being eased away from, and 0..1 progress toward `mode`. */
  from: 'chase' as CameraMode,
  transition: 1,
}

export function cycleCamera(): void {
  cameraState.from = cameraState.mode
  cameraState.index = (cameraState.index + 1) % CAMERA_MODES.length
  cameraState.mode = CAMERA_MODES[cameraState.index]
  cameraState.transition = 0
}
