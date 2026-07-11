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
const HIGH_KEY = 'sundown-run.highScore'

function loadScore(key: string): number {
  try {
    const v = parseFloat(localStorage.getItem(key) ?? '')
    return Number.isFinite(v) && v > 0 ? v : 0
  } catch {
    return 0
  }
}

function saveScore(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(Math.round(v)))
  } catch {
    // storage unavailable - the number just won't survive a reload
  }
}

/**
 * A landing emits its whole chain in ONE physics step - AIR, then SPIN, then the
 * combo bonus, microseconds apart. A poller that only keeps the latest event
 * would show just the last of the burst, so the recent events live in a small
 * ring: `nonce` counts every emit ever, and a consumer that has seen `seen`
 * drains the (nonce - seen) newest, capped at the ring size.
 */
export const RECENT_SIZE = 8

// Same discipline as core/telemetry.ts: a mutable singleton, no setters, no React.
export const tricksState = {
  /** Points earned this session. Resets on page load - and on a WIPEOUT. */
  sessionScore: 0,
  /** All-time high-water mark of sessionScore, persisted. Banked as it grows, so a
   *  wipeout can zero the session without ever touching the high score. */
  highScore: loadScore(HIGH_KEY),
  /** All-time best single-combo score, persisted. */
  bestCombo: loadScore(BEST_KEY),
  /** The most recent trick - convenience alias for recent[(nonce-1) % RECENT_SIZE]. */
  lastEvent: null as TrickEvent | null,
  /** Ring of the latest emits; slot k holds the event whose emit index was k mod RECENT_SIZE. */
  recent: new Array<TrickEvent | null>(RECENT_SIZE).fill(null),
  /** Total emits ever - bumped once per emitTrick call. */
  nonce: 0,
}

/** Detection side (vehicle physics) reports one landed/completed trick. */
export function emitTrick(label: string, points: number, comboCount: number): void {
  tricksState.sessionScore += points
  // Bank the high score as it grows - a later wipeout zeroes the session, never this.
  if (tricksState.sessionScore > tricksState.highScore) {
    tricksState.highScore = tricksState.sessionScore
    saveScore(HIGH_KEY, tricksState.highScore)
  }
  const ev: TrickEvent = { label, points, comboCount }
  tricksState.lastEvent = ev
  tricksState.recent[tricksState.nonce % RECENT_SIZE] = ev
  tricksState.nonce++
}

/**
 * A crash landing wipes the WHOLE session score, not just the chain in the air -
 * that risk is what makes holding a big score feel like something. Emits a
 * WIPEOUT event carrying the (negative) points lost so the UI can rub it in.
 */
export function wipeoutSession(): void {
  const lost = Math.round(tricksState.sessionScore)
  tricksState.sessionScore = 0
  const ev: TrickEvent = { label: 'WIPEOUT', points: -lost, comboCount: 1 }
  tricksState.lastEvent = ev
  tricksState.recent[tricksState.nonce % RECENT_SIZE] = ev
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
