// ============================================================
//  HUD - minimal, warm, out of the way
// ------------------------------------------------------------
//  Two update paths, deliberately:
//
//  * Numbers that change every frame (speed, gear, the running lap clock) are
//    written straight into the DOM with textContent from a single rAF loop,
//    throttled to 15Hz. Never React state - see constitution section 2.
//  * Numbers that change rarely (lap count, best lap, shards found) come from
//    the zustand store and re-render normally. That is a handful of renders per
//    lap, not sixty per second.
//
//  The same rAF loop watches telemetry edges (airborne, drifting) and raises the
//  toasts. Everything eases; nothing pops.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { CONFIG } from '../core/config'
import { telemetry } from '../core/telemetry'
import { useGameStore } from '../core/store'
import { LAP } from '../vehicle/tuning'
import { vehicleSignals } from '../vehicle/vehicleSignals'
import * as audio from '../audio/AudioEngine'
import { HUD_CSS } from './hudStyles'
import { IntroCard } from './IntroCard'
import { TrickHud } from './TrickHud'
import { formatLap } from './format'

/** Text writes per second. The eye cannot read a 60Hz speedo anyway. */
const TEXT_HZ = 15
const TEXT_MS = 1000 / TEXT_HZ

const TOAST_MS = 1700 //   matches the CSS in / hold / out timeline
const HINT_SECONDS = 8 //  driving time before the controls hint retires

/** A drift has to survive this long to be worth celebrating. */
const DRIFT_MIN_S = 1.0
const DRIFT_GRACE_S = 0.35 //  a momentary catch does not end the combo
const DRIFT_SLIP = 0.3
const DRIFT_KMH = 25

const AIR_LANDING_S = 0.3 //   below this a landing is just a bump
const AIR_TOAST_S = 0.45

interface Toast {
  id: number
  text: string
  gold: boolean
  /** 'void' tints the toast amber - a note, not a celebration */
  variant?: 'void'
}

declare global {
  interface Window {
    /** Dev probe: the live store the HUD is actually subscribed to. */
    __hud?: { store: typeof useGameStore }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function HUD() {
  const lapCount = useGameStore((s) => s.lapCount)
  const lastLapMs = useGameStore((s) => s.lastLapMs)
  const lastLapDirty = useGameStore((s) => s.lastLapDirty)
  const currentLapDirty = useGameStore((s) => s.currentLapDirty)
  const bestLapMs = useGameStore((s) => s.bestLapMs)
  const found = useGameStore((s) => s.collectiblesFound)
  const total = useGameStore((s) => s.collectiblesTotal)
  const inputDevice = useGameStore((s) => s.inputDevice)

  const [toast, setToast] = useState<Toast | null>(null)
  const [hintGone, setHintGone] = useState(false)

  const speedRef = useRef<HTMLDivElement>(null)
  const gearRef = useRef<HTMLDivElement>(null)
  const clockRef = useRef<HTMLDivElement>(null)
  const toastId = useRef(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Single slot, last wins - toasts replace, they never stack.
  const showToast = useCallback((text: string, gold = false, variant?: 'void') => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    setToast({ id: ++toastId.current, text, gold, variant })
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null
      setToast(null)
    }, TOAST_MS)
  }, [])

  // ---------- the one rAF loop ----------
  useEffect(() => {
    const speedEl = speedRef.current
    const gearEl = gearRef.current
    const clockEl = clockRef.current
    if (!speedEl || !gearEl || !clockEl) return

    let raf = 0
    let prevMs = performance.now()
    let lastWrite = 0

    // lap clock
    let running = false
    let lapStart = 0
    let prevLapCount = useGameStore.getState().lapCount
    let prevResetTick = vehicleSignals.resetTick

    // edge trackers
    let airStart = 0
    let driftSeconds = 0
    let driftGrace = 0
    let driveSeconds = 0
    let hintRetired = false

    // last written values - textContent is a layout invalidation, so only write on change
    let lastSpeed = -1
    let lastGear = -1
    let lastClock = ''

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - prevMs) / 1000)
      prevMs = now

      const speedKmh = telemetry.speedKmh

      // ----- lap clock: mirrors vehicle/lapTracker's rules -----
      const lc = useGameStore.getState().lapCount
      if (lc !== prevLapCount) {
        prevLapCount = lc
        lapStart = now
      }
      const rt = vehicleSignals.resetTick
      if (rt !== prevResetTick) {
        prevResetTick = rt
        if (running) lapStart = now
        airStart = 0
        driftSeconds = 0
      }
      if (!running && speedKmh >= LAP.startKmh) {
        running = true
        lapStart = now
      }

      // ----- air time -----
      if (telemetry.airborne) {
        if (airStart === 0) airStart = now
      } else if (airStart !== 0) {
        const seconds = (now - airStart) / 1000
        airStart = 0
        if (seconds >= AIR_LANDING_S) {
          audio.playLanding(clamp(seconds / 1.6, 0.25, 1))
          if (seconds >= AIR_TOAST_S) showToast(`AIR TIME ${seconds.toFixed(1)}s!`)
        }
      }

      // ----- sustained drift -----
      if (telemetry.drifting && telemetry.slip > DRIFT_SLIP && speedKmh > DRIFT_KMH) {
        driftSeconds += dt
        driftGrace = DRIFT_GRACE_S
      } else if (driftSeconds > 0) {
        driftGrace -= dt
        if (driftGrace <= 0) {
          if (driftSeconds >= DRIFT_MIN_S) showToast(`NICE DRIFT +${driftSeconds.toFixed(1)}s`)
          driftSeconds = 0
        }
      }

      // ----- controls hint retires once you can clearly drive -----
      if (!hintRetired) {
        if (speedKmh > LAP.startKmh) driveSeconds += dt
        if (driveSeconds > HINT_SECONDS) {
          hintRetired = true
          setHintGone(true)
        }
      }

      // ----- DOM writes, 15Hz -----
      if (now - lastWrite < TEXT_MS) return
      lastWrite = now

      const kmh = Math.round(speedKmh)
      if (kmh !== lastSpeed) {
        lastSpeed = kmh
        speedEl.textContent = String(kmh)
      }
      const gear = telemetry.gear
      if (gear !== lastGear) {
        lastGear = gear
        gearEl.textContent = `G${gear}`
      }
      const clock = formatLap(running ? now - lapStart : 0)
      if (clock !== lastClock) {
        lastClock = clock
        clockEl.textContent = clock
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [showToast])

  // ---------- rare events: laps and shards ----------
  useEffect(
    () =>
      useGameStore.subscribe((s, prev) => {
        if (s.lapCount !== prev.lapCount && s.lastLapMs !== null) {
          // A dirty lap can be quicker than the record and still not BE the
          // record - bestLapMs never moved. Gate on the flag, not on the time.
          const best = !s.lastLapDirty && s.bestLapMs !== null && s.lastLapMs <= s.bestLapMs
          audio.playLap(best)
          showToast(
            best ? `BEST LAP  ${formatLap(s.lastLapMs)}` : `LAP ${s.lapCount}  ${formatLap(s.lastLapMs)}`,
            best
          )
        }
        // Line crossed without hitting every sector: the lap does not count.
        if (s.lapVoidNonce !== prev.lapVoidNonce) {
          audio.playVoid()
          showToast('LAP VOID - missed the track!', false, 'void')
        }
        if (
          s.collectiblesFound !== prev.collectiblesFound &&
          s.collectiblesTotal > 0 &&
          s.collectiblesFound === s.collectiblesTotal
        ) {
          // let the pickup chime ring before the fanfare lands on top of it
          setTimeout(() => {
            audio.playAllFound()
            showToast('ALL SHARDS FOUND!', true)
          }, 280)
        }
      }),
    [showToast]
  )

  useEffect(() => {
    window.__hud = { store: useGameStore }
    return () => {
      delete window.__hud
    }
  }, [])

  useEffect(() => () => { if (toastTimer.current !== null) clearTimeout(toastTimer.current) }, [])

  return (
    <div className="hud-root">
      <style>{HUD_CSS}</style>

      <div className={`hud-panel hud-lap${CONFIG.showFps ? ' hud-lap--fps' : ''}`}>
        <div className="hud-lap__label">LAP {lapCount + 1}</div>
        {/* Off-road play is legal - it just cannot set a record. Amber, not red.
            Both tags stay mounted and fade: mounting them would jump the panel
            width, and nothing in this HUD is allowed to pop. */}
        <div className="hud-lap__clockrow">
          <div
            className={`hud-lap__clock${currentLapDirty ? ' hud-lap__clock--dirty' : ''}`}
            ref={clockRef}
          >
            0:00.000
          </div>
          <span className={`hud-tag${currentLapDirty ? ' hud-tag--on' : ''}`} aria-hidden={!currentLapDirty}>
            OFF ROAD
          </span>
        </div>
        <div className="hud-lap__rows">
          <div className="hud-lap__row">
            <span>LAST</span>
            <i
              className={`hud-tag hud-tag--mini${lastLapDirty ? ' hud-tag--on' : ''}`}
              aria-hidden={!lastLapDirty}
            >
              OFF ROAD
            </i>
            <b className={lastLapDirty ? 'dirty' : undefined}>{formatLap(lastLapMs)}</b>
          </div>
          <div className="hud-lap__row">
            <span>BEST</span>
            <b className="amber">{formatLap(bestLapMs)}</b>
          </div>
        </div>
      </div>

      {/* keyed on `found` so the pop animation replays on every pickup */}
      <div key={found} className="hud-panel hud-shards">
        <div className="hud-shards__gem" />
        <div className="hud-shards__count">
          {found}
          <i>/{total || 0}</i>
        </div>
        <div className="hud-shards__label">SUN SHARDS</div>
      </div>

      <div className="hud-speed">
        <div className="hud-gear" ref={gearRef}>
          G1
        </div>
        <div className="hud-speed__num" ref={speedRef}>
          0
        </div>
        <div className="hud-speed__unit">km/h</div>
      </div>

      {toast && (
        <div
          key={toast.id}
          className={`hud-toast${toast.gold ? ' hud-toast--gold' : ''}${
            toast.variant === 'void' ? ' hud-toast--void' : ''
          }`}
        >
          {toast.text}
        </div>
      )}

      <div className={`hud-hint${hintGone ? ' hud-hint--gone' : ''}`}>
        {inputDevice === 'gamepad' ? (
          <>
            <b className="hud-key">LS</b>
            <em>steer</em>
            <b className="hud-key">RT</b>
            <em>gas</em>
            <b className="hud-key">LT</b>
            <em>brake</em>
            <b className="hud-key">A</b>
            <em>handbrake</em>
            <b className="hud-key">RB</b>
            <em>camera</em>
            <b className="hud-key">Y</b>
            <em>reset</em>
            <b className="hud-key">VIEW</b>
            <em>restart</em>
            <b className="hud-key">MENU</b>
            <em>menu</em>
          </>
        ) : (
          <>
            <b className="hud-key">W A S D</b>
            <em>drive</em>
            <b className="hud-key">SPACE</b>
            <em>handbrake</em>
            <b className="hud-key">C</b>
            <em>camera</em>
            <b className="hud-key">R</b>
            <em>reset</em>
            <b className="hud-key">SHIFT+R</b>
            <em>restart</em>
            <b className="hud-key">ESC</b>
            <em>menu</em>
          </>
        )}
      </div>

      <TrickHud />

      <IntroCard />
    </div>
  )
}
