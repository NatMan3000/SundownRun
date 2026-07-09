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
