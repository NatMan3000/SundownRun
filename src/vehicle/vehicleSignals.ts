// One-frame events the vehicle raises and other systems consume.
// Mutable singleton (same rule as core/telemetry.ts): mutate, never replace.

export const vehicleSignals = {
  /**
   * Bumped the instant the car teleports (reset / respawn). The chase camera
   * watches this and SNAPS once - the single sanctioned exception to
   * "nothing teleports" in the constitution.
   */
  resetTick: 0,

  /** Set true once the physics body exists and has been stepped at least once. */
  ready: false,
}

/**
 * Synced multiplayer race. Written by the net layer (src/net) when a race
 * message arrives (or is initiated locally); consumed by the vehicle physics
 * (teleport to the start line + throttle lock until `goAt`) and the HUD
 * (countdown overlay). Single-player never touches it.
 */
export const raceSignal = {
  /** bumped when a countdown starts - the vehicle teleports on change */
  nonce: 0,
  /** performance.now() timestamp when controls unlock ("GO!") */
  goAt: 0,
  /** this player's lateral start-line offset in metres (grid slot) */
  slot: 0,
  /** true from countdown until someone wins (guards duplicate winners) */
  active: false,
  /** shared id so winner messages can't cross between races */
  raceId: 0,
}
