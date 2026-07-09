// ============================================================
//  HANDLING BASELINE
// ------------------------------------------------------------
//  These are the numbers that make the car feel like a car.
//  CONFIG (core/config.ts) MULTIPLIES some of them - the baseline
//  below has to feel great with every CONFIG knob at 1.0.
//
//  Josh: don't edit this file, edit core/config.ts.
// ============================================================

/** Fixed physics step. Must match <Physics timeStep> in App.tsx. */
export const DT = 1 / 60

export const CHASSIS = {
  mass: 1200, //                 kg - a light hot hatch
  /** Centre of mass, chassis-local metres. Slightly below the origin: low COM = it corners instead of capsizing. */
  comY: -0.05,
  /** Principal moments of inertia (pitch, yaw, roll) kg m^2.
   *  Yaw is deliberately ~15% under the box-solid value so the car rotates eagerly.
   *  Roll is well above it so a slide leans the body instead of tripping it. */
  inertia: { x: 1800, y: 1700, z: 620 },
  /** Half-extents of the physics box. Slightly inside the visual body so it does not snag on kerbs.
   *  Its underside sits ~0.30m over the road at rest: high enough that the raycast suspension
   *  carries the car, low enough that a real impact registers as one. */
  halfExtents: { x: 0.88, y: 0.4, z: 2.0 },
  /** Box centre, chassis-local. */
  offsetY: 0.16,
  angularDamping: 0.28,
}

export const WHEEL = {
  radius: 0.34,
  /** Track half-width and wheelbase half-length. */
  halfTrack: 0.8,
  halfBase: 1.42,
  /** Suspension attachment point height, chassis-local. */
  anchorY: 0.1,
  /** Anchor -> wheel centre at full droop. Ray length is restLength + radius. */
  restLength: 0.4,
}

export const RAY_LENGTH = WHEEL.restLength + WHEEL.radius

export const SUSPENSION = {
  /** N/m per corner. 30000 over 300kg quarter-mass = 1.6Hz ride frequency - a real car's number. */
  stiffness: 30000,
  /** N s/m. c_crit = 2*sqrt(k*m) = 6000, so these are zeta 0.60 / 0.77.
   *  Rebound damps harder than compression, exactly like a real damper: the car
   *  soaks up a bump, then settles once instead of pogoing. */
  dampCompress: 3600,
  dampRebound: 4600,
  /** Never launch the car into orbit off a kerb. */
  maxForce: 26000,
  /** Anti-roll bars, N/m of left-right compression difference.
   *  Front stiffer than rear: keeps the nose flat, lets the rear rotate. */
  antiRollFront: 14000,
  antiRollRear: 11000,
}

export const TYRE = {
  /** Peak friction coefficients (multiplied by CONFIG.grip).
   *  Rear slightly under front, which is what gives the car its willingness to rotate. */
  muFront: 1.62,
  muRear: 1.5,
  /**
   *  SLIP CURVE. Lateral grip vs slip angle (rad), normalised 0..1 of mu:
   *
   *      1.0 |      /\_
   *          |     /   \____   <- slide plateau (0.66)
   *          |    /
   *      0.0 |___/________________  slip angle
   *             ^peak      ^tail
   *
   *  Grip climbs linearly to a PEAK at 7.5deg, then falls away to a SLIDE plateau
   *  by 34deg. The falling section is the entire reason a drift feels real: once
   *  you are past the peak, adding steering angle gives you LESS grip, so the
   *  slide holds instead of instantly snapping back. The plateau (not zero) is
   *  why the drift is catchable - there is always something left to steer with.
   */
  peakSlip: 0.13,
  tailSlip: 0.6,
  slideFrac: 0.66,
  /** Handbrake multiplies rear mu by this - the rear steps out on command. */
  handbrakeGrip: 0.3,
  /** Rolling resistance as a fraction of vertical load. */
  rollingResistance: 0.014,
  /** Below this ground speed the slip angle is computed against a floor value,
   *  so the car does not think it is sliding sideways at walking pace. */
  slipSpeedFloor: 2.0,
}

export const DRIVE = {
  /** Total drive force at zero speed, N (multiplied by CONFIG.enginePower). */
  maxForce: 9200,
  /** Force fade: F = maxForce * (1 - fade * (v/vTop)^2). Tuned so the car
   *  asymptotes just past CONFIG.topSpeedKmh against drag. */
  powerFade: 0.86,
  /** Rear-wheel drive. Classic, kickable, and the handbrake has something to do. */
  rearBias: 1.0,
  reverseForce: 3800,
  reverseTopKmh: 45,
  /** Total brake force N (multiplied by CONFIG.brakeStrength), split front/rear. */
  brakeForce: 16000,
  brakeFrontBias: 0.62,
  /** Extra rear brake force when the handbrake is pulled. */
  handbrakeForce: 5200,
}

export const AERO = {
  /** F_drag = drag * v^2, opposing velocity. */
  drag: 0.3,
  /** F_down = downforce * v^2, along -carUp. ~13% of weight at top speed. */
  downforce: 0.55,
}

export const STEERING = {
  /** Max road-wheel angle at a standstill / at high speed (radians). */
  maxAngleLow: 0.593, //  34 deg
  maxAngleHigh: 0.166, // 9.5 deg
  /** Speed (m/s) at which the high-speed limit is fully applied. */
  fadeSpeed: 42,
  /** While drifting the limit re-opens to this, so a slide is always catchable. */
  driftAngle: 0.42,
  /** Steering rack slew rate, rad/s. */
  rackRate: 7,
}

export const ASSIST = {
  /** Yaw damping torque, Nm per rad/s. Slashed while drifting so the slide stays alive. */
  yawDamp: 800,
  yawDampDrift: 250,
  /** Air control - deliberately weak. You steer the landing, you don't fly. */
  airPitch: 900,
  airYaw: 700,
  airAngularDamp: 0.9,
  /** Extra lateral damping below walking pace so the car doesn't creep sideways. */
  lowSpeedLateral: 0.6,
}

export const STATE = {
  /** speed (m/s) and rear slip above which telemetry.drifting goes true. */
  driftSpeed: 5,
  driftSlip: 0.25,
  /** Impact = |dv| per step above this threshold, normalised over this range.
   *  dv * mass IS the impulse, so this is impulse-proportional by construction. */
  impactThreshold: 1.2,
  impactRange: 6,
  impactDecay: 3, //   per second
  /** Reset guards. */
  fallY: -50,
  upsideDownSeconds: 3,
  /** Road / lap queries are O(2048) and allocate - run them at 12Hz, not 60. */
  roadQueryEverySteps: 5,
}

/** Gear top speeds in km/h. Six speeds, close-ratio: the engine note is always busy. */
export const GEAR_TOP_KMH = [48, 82, 116, 148, 174, 200]
export const RPM = {
  /** rpm at the bottom of each gear, and how much of the band the gear covers. */
  base: 0.2,
  span: 0.78,
  idle: 0.1,
  /** Blipping the throttle at a standstill revs the engine. */
  idleThrottle: 0.3,
  /** Wheelspin drags the needle up past what road speed alone would give. */
  spinBoost: 0.22,
  /** Downshift when speed falls below this fraction of the lower gear's top.
   *  Close to 1 keeps the hysteresis band narrow so the needle is never parked. */
  downshiftHysteresis: 0.9,
  /** Throttle-cut dip on a shift, and how long it lasts. */
  shiftCut: 0.78,
  shiftSeconds: 0.16,
  /** Needle smoothing (per second). Slow enough to hear the drop on an upshift. */
  smoothing: 11,
}

export const VISUAL = {
  /** Extra body lean on top of the physics roll, radians per m/s^2. */
  rollGain: 0.0056,
  rollMax: 0.075,
  /** Nose lift under power / dive under brakes. */
  pitchGain: 0.006,
  pitchMax: 0.06,
  /** Critically damped, rad/s. */
  omega: 12,
  /** Wheel angular velocity chases road speed at this rate (per second). */
  spinRate: 12,
}

export const CAMERA = {
  /** Smooth-damp times, seconds. Shorter = tighter. */
  posSmooth: 0.16,
  posSmoothDrift: 0.12,
  lookSmooth: 0.1,
  fovSmooth: 0.35,
  /** Camera swings toward the VELOCITY direction as the car slides. This one
   *  detail is what makes a drift read as a drift from behind. */
  velocityBlendBase: 0.35,
  velocityBlendSlip: 0.5,
  /** Distance / height grow slightly with speed. */
  distanceSpeedGain: 0.1,
  heightSpeedGain: 0.05,
  /** Look target sits ahead of the car, further ahead the faster you go. */
  lookAhead: 2,
  lookAheadSpeedGain: 0.06,
  lookHeight: 0.9,
  /** Rotational speed shake - tiny. Nausea is a bug. */
  shakeAmp: 0.0016,
  /** Impact kick amplitude in radians / metres. */
  kickRot: 0.05,
  kickPos: 0.35,
  /** Camera never gets closer than this to the ground under it. */
  groundClearance: 0.6,
  /** Terrain height under the camera is sampled at this rate (it allocates). */
  groundQueryHz: 12,
}

export const LAP = {
  /** Crossing t=0 forwards counts, but only after this long on the current lap. */
  minLapMs: 5000,
  /** How close to the ends of the spline the crossing test looks. */
  crossBand: 0.15,
  /** Timing starts on first movement. */
  startKmh: 2,
}
