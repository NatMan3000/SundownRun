import * as THREE from 'three'

// Per-frame game state. MUTABLE SINGLETON - written by the vehicle system every
// physics step, read by camera / HUD / audio / fx. This exists so nothing does
// React setState per frame (constitution, section 2). Do not replace the object
// or its vectors - mutate in place.

export const telemetry = {
  // motion
  speedKmh: 0,
  rpm: 0, //            0..1 normalised engine rpm for audio pitch
  gear: 1,
  // driver inputs after smoothing (what the car actually received)
  throttle: 0, //       0..1
  brake: 0, //          0..1
  steer: 0, //          -1..1 (left negative)
  handbrake: false,
  // state
  slip: 0, //           0..1 how much the tyres are sliding (drives smoke + audio)
  drifting: false,
  airborne: false,
  onRoad: true,
  impact: 0, //         0..1, set on collision, decays - drives camera kick + audio
  // pose (world space) - camera and fx read these, vehicle writes them
  carPosition: new THREE.Vector3(0, 2, 0),
  carQuaternion: new THREE.Quaternion(),
  carVelocity: new THREE.Vector3(),
}

export type Telemetry = typeof telemetry
