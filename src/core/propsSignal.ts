// ============================================================
//  PROPS SIGNAL - the multiplayer seam for crash props
// ------------------------------------------------------------
//  Crash-prop layouts are already deterministic: scatterAll(round) is
//  seeded by the round number, so two machines given the same round
//  produce identical worlds. Single-player uses vehicleSignals.resetTick
//  as the round (re-scatter on every reset). In multiplayer that would
//  diverge instantly - resets are local - so the net layer flips
//  `shared` on and drives `round` itself: everyone boots on round 0,
//  and every synced race start deals a fresh shared round.
//
//  Pop events flow both ways through here so CrashProps never imports
//  the net layer (and keeps working when there isn't one):
//    outgoing - CrashProps calls onLocalPop when THIS car bursts a
//               cluster; NetSystem broadcasts it.
//    incoming - the net layer queues remote bursts in `pending`;
//               CrashProps drains them each frame (burst, no points -
//               the smasher already scored on their machine).
//
//  Mutable singleton, same rule as core/telemetry.ts.
// ============================================================

export interface PropPop {
  /** family index + cluster index into the deterministic layout */
  f: number
  i: number
  /** the smashing car's velocity + speed - shapes the burst direction */
  vx: number
  vz: number
  speed: number
}

export const propsSignal = {
  /** When true, CrashProps scatters from `round` instead of resetTick. */
  shared: false,
  round: 0,
  /** Remote bursts waiting to be applied (drained by CrashProps). */
  pending: [] as PropPop[],
  /** Set by the net layer; called by CrashProps on a local burst. */
  onLocalPop: null as ((pop: PropPop) => void) | null,
}
