// ============================================================
//  SUNDOWN RUN - THE FUN KNOBS
//  This file is yours, Josh. Change a number, save the file,
//  and the game updates instantly. You cannot break anything
//  here that a Ctrl+Z won't fix.
// ============================================================

export const CONFIG = {
  // ---------- YOUR CAR ----------
  carColor: '#1FA8C9', // try '#E8402A' (lava red) or '#8A2BE2' (purple)
  carName: 'Sundown GT',

  // ---------- HANDLING ----------
  grip: 1.0, //          0.7 = slippery drift machine, 1.3 = glued to the road
  enginePower: 1.0, //   1.5 = rocket mode, 0.6 = grandma mode
  topSpeedKmh: 190, //   how fast it can possibly go
  brakeStrength: 1.0, // bigger = stops harder

  // ---------- WORLD ----------
  timeOfDay: 0.5, //     0 = late golden afternoon ... 1 = sun kissing the horizon
  drawDistanceM: 1200, // how far you can see (lower it if the game stutters)

  // ---------- CAMERA ----------
  cameraDistance: 7.5, // metres behind the car
  cameraHeight: 3.0, //   metres above the car
  fovBase: 55, //         normal field of view
  fovMax: 68, //          field of view at top speed (bigger = more speed feel)

  // ---------- FUN ----------
  driftSmoke: true, //    tyre smoke when you drift
  showFps: false, //      true = show the frames-per-second counter
} as const

export type GameConfig = typeof CONFIG
