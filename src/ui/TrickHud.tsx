// ============================================================
//  TRICK HUD - popups + scoreboard for jumps, spins and flips
// ------------------------------------------------------------
//  The drive slice DETECTS tricks and reports them through core/tricks.ts, a
//  telemetry-style mutable singleton. This watches it the same way HUD.tsx
//  watches core/telemetry: one rAF loop, poll `nonce` to catch a fresh trick,
//  and write scoreboard numbers with textContent only when they actually change
//  - never React state per frame (constitution, section 2).
//
//  A trick landing is a sparse event, so the popups themselves ARE React state:
//  one setState per trick, a handful during a wild combo, never sixty a second.
//  They chain visibly - each new one in a combo stacks above the last and glows
//  hotter - then drift up and fade. The whole layer is gated behind CONFIG.tricks.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { CONFIG } from '../core/config'
import { RECENT_SIZE, tricksState } from '../core/tricks'
import * as audio from '../audio/AudioEngine'

/** A trick worth a celebratory audio flourish. Small bumps land silent-but-scored. */
const BIG_TRICK_POINTS = 120

/** How long a popup lives on screen, ms. Matches the CSS in/hold/out timeline. */
const POP_MS = 1400

/** Never let a runaway combo paper the screen - oldest falls off. */
const MAX_POPS = 5

interface Pop {
  id: number
  label: string
  points: number
  /** 1-based position in the combo chain - >1 means this landed mid-air. */
  combo: number
}

export function TrickHud() {
  // Gate before any hooks so the whole feature vanishes with one config flag.
  if (!CONFIG.tricks) return null
  return <TrickHudInner />
}

function TrickHudInner() {
  const [pops, setPops] = useState<Pop[]>([])
  const popId = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const scoreRef = useRef<HTMLDivElement>(null)
  const bestRef = useRef<HTMLDivElement>(null)

  // ---------- the one rAF loop ----------
  useEffect(() => {
    const scoreEl = scoreRef.current
    const bestEl = bestRef.current
    if (!scoreEl || !bestEl) return

    let raf = 0
    let seenNonce = tricksState.nonce
    let lastScore = -1
    let lastBest = -1

    const tick = () => {
      raf = requestAnimationFrame(tick)

      // ----- fresh tricks? a landing emits its whole chain in ONE physics step,
      // so drain every emit since the last frame from the ring, not just the latest.
      if (tricksState.nonce !== seenNonce) {
        const fresh = Math.min(tricksState.nonce - seenNonce, RECENT_SIZE)
        const from = tricksState.nonce - fresh
        seenNonce = tricksState.nonce
        let loudest = 0
        for (let k = from; k < from + fresh; k++) {
          const ev = tricksState.recent[k % RECENT_SIZE]
          if (!ev) continue
          const id = ++popId.current
          setPops((prev) => {
            const next = prev.length >= MAX_POPS ? prev.slice(1) : prev.slice()
            next.push({ id, label: ev.label, points: ev.points, combo: ev.comboCount })
            return next
          })
          const timer = setTimeout(() => {
            timers.current = timers.current.filter((t) => t !== timer)
            setPops((prev) => prev.filter((p) => p.id !== id))
          }, POP_MS)
          timers.current.push(timer)
          if (ev.points > loudest) loudest = ev.points
        }
        if (loudest >= BIG_TRICK_POINTS) audio.playTrick(loudest)
      }

      // ----- scoreboard: write only on change, same discipline as the speedo -----
      const sc = Math.round(tricksState.sessionScore)
      if (sc !== lastScore) {
        lastScore = sc
        scoreEl.textContent = String(sc)
      }
      const bc = Math.round(tricksState.bestCombo)
      if (bc !== lastBest) {
        lastBest = bc
        bestEl.textContent = String(bc)
      }
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      for (const t of timers.current) clearTimeout(t)
      timers.current.length = 0
    }
  }, [])

  return (
    <>
      {/* popups: newest on top, so a combo reads bottom-up as it climbs */}
      <div className="trick-pops">
        {pops.map((p) => {
          // A zero-point trick is a wipeout - shown muted, not in celebratory gold.
          const fail = p.points <= 0
          return (
            <div
              key={p.id}
              className={`trick-pop${fail ? ' trick-pop--fail' : ''}${
                p.combo > 1 ? ' trick-pop--combo' : ''
              }${p.points >= BIG_TRICK_POINTS ? ' trick-pop--big' : ''}`}
            >
              <span className="trick-pop__label">{p.label}</span>
              {!fail && <span className="trick-pop__pts">+{Math.round(p.points)}</span>}
              {p.points < 0 && <span className="trick-pop__pts">{Math.round(p.points)}</span>}
              {p.combo > 1 && <span className="trick-pop__combo">&times;{p.combo}</span>}
            </div>
          )
        })}
      </div>

      {/* persistent scoreboard, bottom-left, in the lap panel's golden-hour language */}
      <div className="hud-panel trick-board">
        <div className="trick-board__row">
          <span className="trick-board__label">SCORE</span>
          <div className="trick-board__val" ref={scoreRef}>
            0
          </div>
        </div>
        <div className="trick-board__row trick-board__row--best">
          <span className="trick-board__label">BEST COMBO</span>
          <div className="trick-board__val trick-board__val--best" ref={bestRef}>
            0
          </div>
        </div>
      </div>
    </>
  )
}
