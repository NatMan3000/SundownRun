// ============================================================
//  SUNDOWN RUN - THE FUN KNOBS
//  This file is yours, Josh. Change a number, save the file,
//  and the game updates instantly. You cannot break anything
//  here that a Ctrl+Z won't fix.
// ============================================================

export const CONFIG = {
  // ---------- YOUR CAR ----------
  carColor: '#1FA8C9', // try '#E8402A' (lava red) or '#8A2BE2' (purple)
  carBody: 'coupe' as 'coupe' | 'striker' | 'muscle' | 'wedge', // pick your ride!
  carName: 'Sundown GT',

  // ---------- HANDLING ----------
  grip: 1.0, //          0.7 = slippery drift machine, 1.3 = glued to the road
  steering: 1.0, //      0.7 = calm and easy, 1.3 = twitchy go-kart
  stability: 1.0, //     how hard the car catches its own slides. 0.7 = loose and drifty, 1.5 = very hard to spin. Raise it if corners keep spinning you out
  enginePower: 1.5, //   1.5 = rocket mode, 0.6 = grandma mode
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
  treeSmashKmh: 40, //    hit a tree faster than this and it smashes away (slower = solid crunch)
  showFps: false, //      true = show the frames-per-second counter

  // ---------- TRICKS ----------
  tricks: true, //        true = score points for jumps, spins and flips
  bouncyRocks: true, //   true = rocks launch you skyward, false = rocks just hurt
  geysers: true, //       steam vents that BLAST you into the sky - watch for the hiss, time your drive-over

  // ---------- GHOST (race your best lap) ----------
  ghost: true, //         true = a glowing "ghost" of your best lap races you every lap
  ghostColor: '#FFE7B0', // the ghost's glow - a warm golden spirit by default
  ghostOpacity: 0.34, //  0.15 = barely there, 0.6 = bold. How see-through the ghost is.

  // ---------- MULTIPLAYER (run `bun run mp`, open the links it prints) ----------
  multiplayerRam: true, // true = you can SMASH into each other, false = drive through like ghosts
} as const

export type GameConfig = typeof CONFIG
