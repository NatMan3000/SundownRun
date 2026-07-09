// Lap timing on a closed-loop road. The road spline's parameter t runs 0..1 and
// wraps; a lap is a crossing of t=0 in the driving direction, debounced so that
// parking on the line does not machine-gun laps.

import { useGameStore } from '../core/store'
import { LAP } from './tuning'

export class LapTracker {
  private lastT = -1
  private lapStartMs = 0
  private started = false

  /** Call whenever a fresh spline parameter is available (throttled is fine). */
  update(t: number, speedKmh: number, nowMs: number): void {
    if (!this.started) {
      if (speedKmh < LAP.startKmh) {
        this.lastT = t
        return
      }
      this.started = true
      this.lapStartMs = nowMs
      this.lastT = t
      return
    }

    const prev = this.lastT
    this.lastT = t
    if (prev < 0) return

    // Forward crossing of the start line: t wrapped from near 1 back to near 0.
    const wrappedForward = prev > 1 - LAP.crossBand && t < LAP.crossBand
    if (!wrappedForward) return

    const elapsed = nowMs - this.lapStartMs
    if (elapsed < LAP.minLapMs) return

    useGameStore.getState().completeLap(elapsed)
    this.lapStartMs = nowMs
  }

  /** A reset drops you back on the road - do not credit the teleport as a lap. */
  onTeleport(nowMs: number): void {
    this.lastT = -1
    if (this.started) this.lapStartMs = nowMs
  }
}
