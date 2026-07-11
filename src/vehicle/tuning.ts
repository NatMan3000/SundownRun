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
   *  Front markedly stiffer than rear. Two jobs: it keeps the body flat (less roll
   *  means less of the suspension force leaning outward with `carUp`, which is the
   *  one place roll really does feed back into the physics), and a front-biased bar
   *  moves load transfer to the front axle, biasing the limit toward understeer -
   *  the safe, catchable failure. */
  antiRollFront: 22000,
  antiRollRear: 14000,
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
   *          |     /   \____   <- slide plateau
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
  /**
   *  THE PLATEAUS ARE NOT EQUAL, AND THAT IS THE WHOLE STABILITY STORY.
   *
   *  Yaw moment on a symmetric wheelbase is L * (F_front - F_rear). At the PEAK
   *  the rear lets go first (muRear 1.50 < muFront 1.62), so the car rotates
   *  eagerly into a slide - that is the fun. But if both axles then saturated at
   *  the same plateau, the front would keep out-gripping the rear at EVERY angle
   *  and the yaw moment would never change sign: the spin feeds itself all the
   *  way to 180deg with the player's hands off the wheel. That was defect D1.
   *
   *  So the rear holds a HIGHER plateau than the front. Authority inverts:
   *
   *      slip angle  <20deg  ->  front grips harder  ->  car rotates in  (oversteer, fun)
   *      slip angle  >20deg  ->  rear  grips harder  ->  car straightens  (catchable)
   *
   *      crossover where curveRear*muRear == curveFront*muFront, i.e. ~20deg.
   *
   *  Physically defensible too - a RWD car runs wider, stickier rear tyres.
   *  A sustained drift still works because the handbrake (or throttle, via the
   *  friction circle) attacks muRear directly and takes the rear's authority away.
   */
  slideFrontFrac: 0.6,
  slideRearFrac: 0.7,
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
  /**
   *  Limited-slip differential. Drive torque is split between the rear wheels in
   *  proportion to the load on them, clamped to this bias range (0.5 = open, locked
   *  50/50). A flat 50/50 split sends as much torque to the unloaded inside wheel as
   *  to the loaded outside one, so mid-corner the inside rear saturates its friction
   *  circle first, throws away its lateral grip, and the tail leaves - abruptly.
   *  Feeding torque where the load is makes that transition progressive.
   */
  torqueBiasMin: 0.2,
  torqueBiasMax: 0.8,
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
  /** Max road-wheel angle at a standstill (radians). Mechanical lock. */
  maxAngleLow: 0.593, // 34 deg
  /** Absolute floor - the rack never welds itself straight at top speed. */
  minAngle: 0.012,
  /**
   *  THE RACK IS LIMITED BY PHYSICS, NOT BY A FADE CURVE.
   *
   *  Full lock commands a steady-state lateral acceleration of `latLimitG * gain`, so
   *      maxAngle(v) = wheelbase * latLimitG * gain * g / v^2
   *  Under about 33 km/h that is wider than the mechanical lock and `maxAngleLow`
   *  rules; above it, this does. Constant-g steering: full lock always asks for the
   *  same cornering force, at any speed. `gain` is the runtime steering knob
   *  (useGameStore.steering, 0.6..1.6) through a 0.8 gamma - see core/input.ts.
   *
   *  latLimitG SITS AT THE GRIP LIMIT, ON PURPOSE. The tyres peak at muFront 1.62 g.
   *  Commanding meaningfully less than that (the old 1.5 -> 1.28 g at the keyboard)
   *  means full lock only ever uses ~79% of the grip the car has, which is exactly
   *  what "it understeers, it barely turns" feels like. At 1.8 the rack asks for
   *  1.66 g at the keyboard - a hair past the peak - so full lock carves at maximum
   *  grip with the tyre just starting to slip. The slip curve and the restoring
   *  assist are what make that edge safe rather than a spin.
   *
   *  WHAT THE KNOB BUYS, at 120 km/h (grip limit 1.62 g):
   *
   *      knob   pad g    keyboard g    vs grip    attack
   *      0.6    1.20g    1.10g         0.68x      3.19/s   calm, still corners
   *      1.0    1.80g    1.66g         1.02x      4.80/s   default - carves at the limit
   *      1.6    2.62g    2.41g         1.49x      6.99/s   loose - asks for half again
   *                                                        more than the tyres have
   *
   *  NO DEAD ZONE across the handover (knob 1.0, full keyboard lock):
   *
   *      20 km/h  0.66g  (mech lock)     60 km/h  1.76g  (g-cap)
   *      30 km/h  1.48g  (mech lock)     90 km/h  1.69g
   *      33 km/h  1.79g  <- handover    120 km/h  1.66g
   *      40 km/h  1.80g  (g-cap)        190 km/h  1.66g
   *
   *  Commanded g rises monotonically into the plateau and stays there.
   */
  latLimitG: 1.8,
  /** Wheelbase, metres. Front axle to rear axle. */
  wheelbase: 2 * WHEEL.halfBase,
  /**
   *  While CATCHING a slide - and only then - the rack re-opens this far, so
   *  counter-steer is always available. Steering INTO a slide gets no such gift:
   *  that is how you feed a spin, and the player asking for it is usually a kid
   *  who just wants to turn.
   */
  driftAngle: 0.42,
  /** Steering rack slew rate, rad/s. */
  rackRate: 7,
}

export const ASSIST = {
  /** Yaw damping torque, Nm per rad/s. */
  yawDamp: 800,
  /** Slashed while the player is ASKING for a slide, so the drift stays alive. */
  yawDampDrift: 250,
  /** Raised while the car is sliding and the player has let go of everything. */
  yawDampRecover: 1600,

  /**
   *  DRIFT RECOVERY - the hand that catches the car.
   *
   *  A restoring torque toward the velocity vector, Nm per radian of drift angle.
   *  It fades to ZERO the moment the player asks for a slide (handbrake down, or
   *  a real steering input), so a deliberate drift never feels like it is being
   *  fought. With every input released it is what a driver's hands would be doing
   *  - and the player here is a 12-year-old on a digital keyboard who has not
   *  learned to counter-steer yet.
   */
  driftRestore: 2900,
  driftRestoreMax: 3600,
  /** Drift angle (rad) inside which nothing is applied - normal cornering is untouched. */
  driftDeadband: 0.09,
  /** Assist ramps in across this speed band (m/s). Nothing at parking pace. */
  assistSpeedLo: 2.5,
  assistSpeedHi: 8,
  /** Steering input across this band reads as "I meant to do that" and kills the assist. */
  driftIntentLo: 0.15,
  driftIntentHi: 0.55,
  /**
   *  ...but only if it is a COUNTER-steer. Steering into a slide earns only this
   *  fraction of the credit, because it is what a player does when they have lost
   *  the car, not when they are driving it. Holding a direction through a corner
   *  must never switch the safety net off.
   */
  steerIntoIntent: 0.3,
  /** Drift angle (rad) below which "counter-steer" is meaningless - there is no slide yet. */
  counterSteerBeta: 0.12,

  /** Air control - enough authority to style a jump (tricks are the game now),
   *  still short of flying. Turned up from 900/700 on Nathan's playtest call. */
  airPitch: 5000,
  airYaw: 5000,
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
  /**
   *  TUNNELLING GUARD. Rapier heightfields are infinitely thin, so a car descending
   *  faster than roughly 28 m/s can pass straight through one between two steps.
   *  Unreachable with stock CONFIG, but a kid winding `topSpeedKmh` up can get there,
   *  and the world's catch floor 25 m below then holds them ~45 m under the terrain
   *  with no way back. So: if the car is this far BELOW the terrain surface for this
   *  long, put it back on the road.
   *
   *  Depth, not just `fallY`: the terrain runs from below sea level to +140 m, and a
   *  single absolute floor cannot tell "deep in a valley" from "under the world".
   */
  belowTerrainDepth: 8,
  belowTerrainSeconds: 0.5,
  /** getTerrainHeight is O(n) and allocates. 4Hz is plenty to catch a tunnel. */
  belowTerrainEverySteps: 15,
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
  /** Extra body lean on top of the physics roll, radians per m/s^2.
   *  Dialled back from 0.0056 / 0.075: the physics body already rolls ~2.5deg, and
   *  stacking another 4.3deg of stylised lean on top read as the car falling over
   *  before anything had actually gone wrong. */
  rollGain: 0.0042,
  rollMax: 0.055,
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
  /** Timing starts on first movement. */
  startKmh: 2,

  /**
   *  ANTI-CHEAT. Eight invisible checkpoints at spline t = k/8, in order.
   *  A lap only completes if all eight were passed since the last line crossing,
   *  which is what stops a tiny circle over the start line from ticking laps.
   */
  sectors: 8,
  /**
   *  Largest forward jump in spline t between two 12Hz samples that still counts
   *  as continuous travel. At 190 km/h a real sample advances t by 0.0011, so
   *  0.06 (~230 m of spline) is enormous slack - enough for any corner cut across
   *  the grass, where `nearestRoadPoint` legitimately skips ahead. Anything larger
   *  is a teleport or a genuinely skipped section, and earns no checkpoints.
   */
  maxSectorJump: 0.06,
  /**
   *  Cumulative off-road milliseconds before the lap is flagged dirty. Dirty laps
   *  still count and still show their time - they just can never set a best.
   *  3s is the grace: a jump landing or a wide exit costs a few hundred ms, so
   *  only a deliberate course cut spends it.
   */
  dirtyGraceMs: 3000,
  /** Clamp on the dt fed to the off-road accumulator, so a hidden tab cannot dirty a lap. */
  maxSampleMs: 250,
}
