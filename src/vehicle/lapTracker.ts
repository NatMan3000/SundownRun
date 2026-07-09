// ============================================================
//  LAP VALIDITY
// ------------------------------------------------------------
//  The road is a closed loop and the start line is spline t = 0.
//  A raw line crossing is not a lap - two things have to be true:
//
//  SECTORS (was it a real lap?)
//    Eight invisible checkpoints sit at t = k/8. They are marked as
//    the car's nearest-t sweeps FORWARD through them. All eight must
//    be behind you when you cross the line, or the lap is voided.
//    This is what kills the tiny-circle-over-the-line exploit: a car
//    orbiting t=0 crosses the line all day and never touches t=1/8.
//
//  DIRTY (was it a fair lap?)
//    Cumulative off-road time is accrued across the lap. Past 3s the
//    lap goes dirty: it still counts, its time still shows, but it can
//    never set a best. Cutting the course is therefore pointless, while
//    exploring the grass stays free. A jump landing or a wide exit costs
//    a few hundred ms and is forgiven.
//
//  RESET (R) VOIDS THE LAP IN PROGRESS. It is a teleport - it moves the
//  car to the nearest road point, which on a hairpin can be most of a
//  sector ahead. Anything else would be a free shortcut. Timing restarts
//  at the next line crossing, so the clock never lies about what it timed.
//
//  Fed from the vehicle's 12Hz road query - t, speed and onRoad are all
//  already computed there, so this costs nothing extra.
// ============================================================

import { useGameStore } from '../core/store'
import { LAP } from './tuning'

const SECTORS = LAP.sectors

/**
 * Live lap-validity state. MUTABLE SINGLETON, same discipline as core/telemetry.ts -
 * read it, never replace it. Exposed on window.__game for checkers and the HUD.
 */
export const lapState = {
  /** Latest sampled spline parameter, 0..1. The start line is t = 0. */
  splineT: 0,
  /** How many of the ordered checkpoints are behind the car on this lap. */
  sectorsPassed: 0,
  sectorCount: SECTORS,
  /** Bitfield of passed checkpoints, bit k = t of k/8. Handy for spotting WHICH was skipped. */
  sectorMask: 0,
  /** Cumulative milliseconds spent off the road on this lap. */
  offRoadMsThisLap: 0,
  /** True once offRoadMsThisLap passed the grace. Mirrors store.currentLapDirty. */
  dirty: false,
  /** False between a reset and the next line crossing - nothing is being timed. */
  armed: false,
  /** Milliseconds since the lap in progress began. */
  lapElapsedMs: 0,
}

export class LapTracker {
  private passed: boolean[] = new Array(SECTORS).fill(false)
  private lastT = -1
  private lapStartMs = 0
  private lastSampleMs = 0
  private started = false
  private armed = false
  private offRoadMs = 0
  private dirty = false

  /** Forward arc length from `prev` to checkpoint `c`, both in [0,1). */
  private arcTo(prev: number, c: number): number {
    return (c - prev + 1) % 1
  }

  /** Call whenever a fresh spline parameter is available (12Hz is plenty). */
  update(t: number, speedKmh: number, nowMs: number, onRoad: boolean): void {
    lapState.splineT = t
    // dt for the off-road accumulator. First sample, and any sample after a stall
    // or a hidden tab, contributes at most maxSampleMs.
    const dt = this.lastSampleMs === 0 ? 0 : Math.min(nowMs - this.lastSampleMs, LAP.maxSampleMs)
    this.lastSampleMs = nowMs

    if (!this.started) {
      this.lastT = t
      if (speedKmh < LAP.startKmh) return
      // First movement: the car is sitting on the line, so sector 0 is behind it.
      this.started = true
      this.beginLap(nowMs, t)
      this.publish()
      return
    }

    if (this.armed) {
      if (!onRoad && dt > 0) this.offRoadMs += dt
      if (!this.dirty && this.offRoadMs > LAP.dirtyGraceMs) {
        this.dirty = true
        useGameStore.getState().setCurrentLapDirty(true)
      }
      lapState.lapElapsedMs = nowMs - this.lapStartMs
    }

    const prev = this.lastT
    this.lastT = t
    if (prev < 0) {
      this.publish()
      return
    }

    // Forward travel only. A backwards sample gives delta near 1; a teleport or a
    // skipped section gives a big forward delta. Neither earns a checkpoint.
    const delta = (t - prev + 1) % 1
    if (delta > 0 && delta <= LAP.maxSectorJump) {
      this.markSectors(prev, delta)
      const arcToLine = this.arcTo(prev, 0)
      if (arcToLine > 0 && arcToLine <= delta) this.onLineCrossed(nowMs, t)
    }

    this.publish()
  }

  /** Credit every checkpoint lying on the forward arc prev -> prev+delta. */
  private markSectors(prev: number, delta: number): void {
    for (let k = 0; k < SECTORS; k++) {
      if (this.passed[k]) continue
      const a = this.arcTo(prev, k / SECTORS)
      if (a > 0 && a <= delta) this.passed[k] = true
    }
  }

  private onLineCrossed(nowMs: number, t: number): void {
    // Nothing is being timed (we came off a reset): this crossing simply starts a lap.
    if (!this.armed) {
      this.beginLap(nowMs, t)
      return
    }

    const elapsed = nowMs - this.lapStartMs
    // Parked on the line, or orbiting it fast enough to re-cross inside the debounce.
    // Not a lap, not a void - just noise. Sector state is left alone.
    if (elapsed < LAP.minLapMs) return

    let count = 0
    for (let k = 0; k < SECTORS; k++) if (this.passed[k]) count++

    if (count === SECTORS) {
      useGameStore.getState().completeLap(elapsed, this.dirty)
      if (import.meta.env.DEV) {
        console.info(
          `[lap] COMPLETE ${(elapsed / 1000).toFixed(2)}s dirty=${this.dirty} offRoad=${this.offRoadMs | 0}ms`
        )
      }
    } else {
      useGameStore.getState().voidLap()
      if (import.meta.env.DEV) {
        console.info(`[lap] VOID - only ${count}/${SECTORS} sectors, mask=0b${this.mask().toString(2)}`)
      }
    }

    // Either way the clock restarts here, so the timer always describes the lap
    // it is actually timing.
    this.beginLap(nowMs, t)
  }

  private beginLap(nowMs: number, t: number): void {
    this.armed = true
    this.lapStartMs = nowMs
    this.offRoadMs = 0
    this.dirty = false
    this.passed.fill(false)
    this.passed[0] = true // the line itself is checkpoint 0, and you are standing on it
    this.lastT = t
    lapState.lapElapsedMs = 0
    useGameStore.getState().setCurrentLapDirty(false)
  }

  /**
   * A reset teleports the car to the nearest road point - potentially most of a
   * sector ahead. The lap in progress dies; the next line crossing starts a new one.
   */
  onTeleport(nowMs: number): void {
    if (this.armed) useGameStore.getState().voidLap()
    this.armed = false
    this.passed.fill(false)
    this.offRoadMs = 0
    this.dirty = false
    this.lastT = -1
    this.lapStartMs = nowMs
    this.lastSampleMs = 0
    lapState.lapElapsedMs = 0
    this.publish()
  }

  private mask(): number {
    let m = 0
    for (let k = 0; k < SECTORS; k++) if (this.passed[k]) m |= 1 << k
    return m
  }

  private publish(): void {
    let count = 0
    for (let k = 0; k < SECTORS; k++) if (this.passed[k]) count++
    lapState.sectorsPassed = count
    lapState.sectorMask = this.mask()
    lapState.offRoadMsThisLap = this.offRoadMs
    lapState.dirty = this.dirty
    lapState.armed = this.armed
    if (!this.armed) lapState.lapElapsedMs = 0
  }
}
