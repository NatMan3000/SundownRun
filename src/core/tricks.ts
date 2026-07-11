// ============================================================
//  TRICKS - the shared contract between detection and display
// ------------------------------------------------------------
//  The vehicle physics side DETECTS tricks (airtime, spins, flips,
//  rock launches, clean landings) and calls emitTrick(). The UI side
//  DISPLAYS them by polling tricksState once per rAF, exactly the way
//  HUD.tsx already watches core/telemetry.ts - mutate in place, never
//  replace, and bump `nonce` so a poller can tell two identical
//  back-to-back tricks apart.
//
//  This file is the frozen seam between the drive and avui slices.
//  Extend it deliberately; never reshape it mid-build.
// ============================================================

export interface TrickEvent {
  /** Short shout for the popup - "360 SPIN", "BIG AIR", "ROCK LAUNCH". */
  label: string
  points: number
  /** 1-based position in the current combo chain (tricks before touching down). */
  comboCount: number
}

const BEST_KEY = 'sundown-run.bestTrickScore'

function loadBest(): number {
  try {
    const v = parseFloat(localStorage.getItem(BEST_KEY) ?? '')
    return Number.isFinite(v) && v > 0 ? v : 0
  } catch {
    return 0
  }
}

// Same discipline as core/telemetry.ts: a mutable singleton, no setters, no React.
export const tricksState = {
  /** Points earned this session (resets on page load, not on lap restart). */
  sessionScore: 0,
  /** All-time best single-combo score, persisted. */
  bestCombo: loadBest(),
  /** The most recent trick. Poll `nonce` to detect a fresh one. */
  lastEvent: null as TrickEvent | null,
  /** Bumped once per emitTrick call. */
  nonce: 0,
}

/** Detection side (vehicle physics) reports one landed/completed trick. */
export function emitTrick(label: string, points: number, comboCount: number): void {
  tricksState.sessionScore += points
  tricksState.lastEvent = { label, points, comboCount }
  tricksState.nonce++
}

/** Detection side reports a finished combo total (on clean landing). */
export function commitCombo(totalPoints: number): void {
  if (totalPoints <= tricksState.bestCombo) return
  tricksState.bestCombo = totalPoints
  try {
    localStorage.setItem(BEST_KEY, String(Math.round(totalPoints)))
  } catch {
    // storage unavailable - the best just won't survive a reload
  }
}
