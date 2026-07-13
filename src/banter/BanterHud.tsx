// ============================================================
//  BANTER HUD - the CALDERA FM chip, top-centre
// ------------------------------------------------------------
//  Same discipline as TrickHud: gate the whole feature before any
//  hooks, poll the mutable banterState from one throttled rAF loop,
//  and only touch React state when something actually changed.
//  Lines are sparse (one per several seconds at most), so the chip
//  itself being React state costs nothing.
//
//  While the model downloads, a small dim "tuning in" chip shows -
//  honest about the one-time download without shouting about it.
//  On a machine with no WebGPU this component renders nothing and
//  the game is untouched.
// ============================================================

import { useEffect, useState } from 'react'
import { banterEnabled, banterState, startBanter } from './director'

const HOLD_BASE_MS = 3200
const HOLD_PER_CHAR_MS = 45
const FADE_MS = 300
const POLL_MS = 120

const BANTER_CSS = `
.banter-chip {
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(560px, 72vw);
  padding: 8px 18px 10px;
  text-align: center;
  transition: opacity 300ms ease;
}
html[data-intro] .banter-chip { opacity: 0; }
.banter-chip--tuning {
  opacity: 0.7;
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 6px 14px;
}
.banter-chip__eyebrow {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.24em;
  color: var(--amber, #FFB35C);
  margin-bottom: 3px;
}
.banter-chip__line { display: block; font-size: 15px; line-height: 1.35; }
.banter-chip--in { animation: banter-in 260ms ease both; }
.banter-chip--out { opacity: 0; }
@keyframes banter-in {
  from { opacity: 0; transform: translate(-50%, -8px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}
`

interface LineView {
  nonce: number
  line: string
  phase: 'in' | 'out'
}

export function BanterHud() {
  // Gate before any hooks so the whole feature vanishes with the config flag.
  if (!banterEnabled()) return null
  return <BanterHudInner />
}

function BanterHudInner() {
  const [status, setStatus] = useState(banterState.status)
  const [pct, setPct] = useState(0)
  const [view, setView] = useState<LineView | null>(null)

  useEffect(() => {
    startBanter()
    let raf = 0
    let lastPoll = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - lastPoll < POLL_MS) return
      lastPoll = now

      setStatus((prev) => (prev === banterState.status ? prev : banterState.status))
      setPct((prev) => (prev === banterState.pct ? prev : banterState.pct))

      const { line, lineNonce, lineShownAt } = banterState
      setView((prev) => {
        if (!line || lineShownAt === 0) return prev === null ? prev : null
        const age = performance.now() - lineShownAt
        const hold = HOLD_BASE_MS + HOLD_PER_CHAR_MS * line.length
        if (age < hold)
          return prev?.nonce === lineNonce && prev.phase === 'in' ? prev : { nonce: lineNonce, line, phase: 'in' }
        if (age < hold + FADE_MS)
          return prev?.nonce === lineNonce && prev.phase === 'out' ? prev : { nonce: lineNonce, line, phase: 'out' }
        return prev === null ? prev : null
      })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <>
      <style>{BANTER_CSS}</style>
      {status === 'loading' && (
        <div className="hud-panel banter-chip banter-chip--tuning">
          CALDERA FM · tuning in{pct > 0 ? `… ${pct}%` : '…'}
        </div>
      )}
      {status === 'warm' && view && (
        <div key={view.nonce} className={`hud-panel banter-chip banter-chip--${view.phase}`}>
          <span className="banter-chip__eyebrow">CALDERA FM</span>
          <span className="banter-chip__line">{view.line}</span>
        </div>
      )}
    </>
  )
}
