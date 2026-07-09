import * as THREE from 'three'
import { WHEEL } from './tuning'

// ============================================================
//  CAR VISUAL STATE - the contract between physics and mesh
// ------------------------------------------------------------
//  MUTABLE SINGLETON, same discipline as core/telemetry.ts:
//  written by useVehiclePhysics, read by CarBody.sync(). Never
//  replace the object or its vectors - mutate in place, no
//  allocation per frame, no React state.
//
//  A skinner replacing CarBody's meshes needs to honour exactly
//  this and nothing else:
//
//    - the whole car is drawn in CHASSIS-LOCAL space; the rigid
//      body's own pose is already applied by the parent group.
//    - `roll` / `pitch` / `bodyOffsetY` move ONLY the sprung body,
//      never the wheels (that separation is the suspension).
//    - each wheel's `position` is its centre in chassis-local
//      space; it already includes suspension travel.
//    - `steer` yaws the wheel, `spin` rotates it about its axle.
//
//  Axis convention (chassis-local, right-handed):
//    +Z = forward,  +Y = up,  +X = the car's LEFT.
//  So wheels[0]/[2] (x = +halfTrack) are the left-hand pair.
// ============================================================

export interface WheelVisual {
  /** Wheel centre, chassis-local metres. Includes suspension travel. */
  position: THREE.Vector3
  radius: number
  /** Accumulated rotation about the axle (+X), radians. Always increasing forward. */
  spin: number
  /** Steering angle, radians. Positive = steering left. */
  steer: number
  /** Suspension compression, 0 = fully drooped, 1 = bottomed out. */
  compression: number
  /** Is this wheel touching the ground right now? */
  contact: boolean
}

export interface CarVisual {
  /** Extra body lean, radians. Positive = leaning right (i.e. cornering left). */
  roll: number
  /** Extra body pitch, radians. Positive = nose up (i.e. accelerating). */
  pitch: number
  /** Extra body heave, metres. Reserved - physics already heaves the chassis. */
  bodyOffsetY: number
  /** 0..1, drives brake-light emissive. */
  brake: number
  /** True when the car is in reverse gear - drives reverse lights. */
  reversing: boolean
  /** FL, FR, RL, RR. */
  wheels: WheelVisual[]
}

function wheel(x: number, z: number): WheelVisual {
  return {
    position: new THREE.Vector3(x, WHEEL.anchorY - WHEEL.restLength + 0.1, z),
    radius: WHEEL.radius,
    spin: 0,
    steer: 0,
    compression: 0.25,
    contact: true,
  }
}

export const carVisual: CarVisual = {
  roll: 0,
  pitch: 0,
  bodyOffsetY: 0,
  brake: 0,
  reversing: false,
  wheels: [
    wheel(WHEEL.halfTrack, WHEEL.halfBase), //   0 front left
    wheel(-WHEEL.halfTrack, WHEEL.halfBase), //  1 front right
    wheel(WHEEL.halfTrack, -WHEEL.halfBase), //  2 rear left
    wheel(-WHEEL.halfTrack, -WHEEL.halfBase), // 3 rear right
  ],
}

/** Handle CarBody exposes so the vehicle can push visual state at an exact moment. */
export interface CarBodyHandle {
  /** Apply `carVisual` to the meshes. Called by Vehicle once per rendered frame. */
  sync(): void
}
