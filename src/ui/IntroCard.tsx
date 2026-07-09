// The title screen. It is also the browser's autoplay gesture: whatever dismisses
// this card is the first user interaction, and that is where the AudioContext
// gets built.
//
// It doubles as the garage. The real car is sitting on the road right behind the
// card, so switching bodies IS the preview - there is no model viewer to build.
//
// It self-dismisses once the car is actually moving, so the ?demo=1 autopilot
// never ends up screenshotting a title card.

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { CONFIG } from '../core/config'
import { telemetry } from '../core/telemetry'
import { CAR_BODIES, useGameStore, type CarBodyId } from '../core/store'
import * as audio from '../audio/AudioEngine'

const DRIVING_KMH = 3

/** Standard gamepad mapping. The dpad browses the garage; everything else drives. */
const DPAD_LEFT = 14
const DPAD_RIGHT = 15

/** Short, and deliberately not "SUNDOWN <x>" - that name is CONFIG.carName's job. */
const CAR_NAMES: Record<CarBodyId, string> = {
  coupe: 'CLASSIC COUPE',
  striker: 'DUSK STRIKER',
  muscle: 'EMBER MUSCLE',
  wedge: 'HORIZON WEDGE',
}

export function IntroCard() {
  const [out, setOut] = useState(false)
  const [gone, setGone] = useState(false)
  const carBody = useGameStore((s) => s.carBody)

  // The HUD hides itself while the card is up (see hudStyles), so the title
  // screen is a title screen and not a title screen with a speedo behind it.
  // Layout effect, not passive: the attribute has to land before the first
  // paint or the speedo flashes for one frame.
  useLayoutEffect(() => {
    if (out) delete document.documentElement.dataset.intro
    else document.documentElement.dataset.intro = 'true'
    return () => {
      delete document.documentElement.dataset.intro
    }
  }, [out])

  // Reads the store rather than closing over `carBody`, so the handlers below
  // can be registered once and never go stale.
  const cycle = useCallback((dir: number) => {
    const s = useGameStore.getState()
    const i = CAR_BODIES.indexOf(s.carBody)
    const next = CAR_BODIES[(i + dir + CAR_BODIES.length) % CAR_BODIES.length]
    if (next === s.carBody) return
    s.setCarBody(next)
    audio.playSelect(CAR_BODIES.indexOf(next))
  }, [])

  useEffect(() => {
    if (out) {
      const id = setTimeout(() => setGone(true), 340) // outlives the 300ms fade
      return () => clearTimeout(id)
    }

    /** A real DOM gesture: safe to build the AudioContext here, and only here. */
    const dismissByGesture = () => {
      audio.ensureStarted()
      setOut(true)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      // The garage carve-out. Browsing cars must not start the race.
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        if (!e.repeat) cycle(e.code === 'ArrowLeft' ? -1 : 1)
        return
      }
      dismissByGesture()
    }

    const opts: AddEventListenerOptions = { passive: true }
    window.addEventListener('keydown', onKeyDown, opts)
    window.addEventListener('pointerdown', dismissByGesture, opts)
    window.addEventListener('touchstart', dismissByGesture, opts)

    // A gamepad press raises no DOM event, and the autopilot raises none either.
    // Note a gamepad button is NOT a user gesture as far as the browser is
    // concerned, so this path never calls ensureStarted() - doing so would only
    // earn an "AudioContext was not allowed to start" warning in the console.
    let prevLeft = false
    let prevRight = false
    const poll = setInterval(() => {
      if (telemetry.speedKmh > DRIVING_KMH) {
        setOut(true)
        return
      }
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i]
        if (!p || !p.connected) continue

        const left = p.buttons[DPAD_LEFT]?.pressed ?? false
        const right = p.buttons[DPAD_RIGHT]?.pressed ?? false
        if (left && !prevLeft) cycle(-1)
        if (right && !prevRight) cycle(1)
        prevLeft = left
        prevRight = right

        for (let b = 0; b < p.buttons.length; b++) {
          if (b === DPAD_LEFT || b === DPAD_RIGHT) continue
          if (p.buttons[b].pressed) {
            setOut(true)
            return
          }
        }
        break // first connected pad owns the garage
      }
    }, 80)

    return () => {
      window.removeEventListener('keydown', onKeyDown, opts)
      window.removeEventListener('pointerdown', dismissByGesture, opts)
      window.removeEventListener('touchstart', dismissByGesture, opts)
      clearInterval(poll)
    }
  }, [out, cycle])

  if (gone) return null

  /** Swallow the event before it reaches the window dismiss listeners. */
  const pick = (dir: number) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    cycle(dir)
  }
  const swallow = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <div className={out ? 'intro intro--out' : 'intro'}>
      {/* The scrim is .intro__inner::before - anchored to the text block itself
          so it tracks the copy instead of a guessed pixel box. See hudStyles. */}
      <div className="intro__inner">
        <h1 className="intro__title">SUNDOWN RUN</h1>
        <div className="intro__rule" />
        <div className="intro__kicker">a golden hour drive &nbsp;&middot;&nbsp; {CONFIG.carName}</div>

        <div className="intro__controls">
          <span>
            <b className="hud-key">W A S D</b>
            <em>drive</em>
          </span>
          <span>
            <b className="hud-key">SPACE</b>
            <em>handbrake</em>
          </span>
          <span>
            <b className="hud-key">C</b>
            <em>camera</em>
          </span>
          <span>
            <b className="hud-key">R</b>
            <em>reset</em>
          </span>
        </div>
        <div className="intro__pad">
          gamepad: left stick &middot; triggers &middot; A handbrake &middot; RB camera &middot; Y reset
        </div>

        {/* The garage. Divs, not buttons: a native button would also fire on
            Enter/Space while focused, which are "start the game" keys here. */}
        <div className="intro__garage">
          <div
            className="intro__chev"
            role="button"
            tabIndex={-1}
            aria-label="previous car"
            onPointerDown={pick(-1)}
            onTouchStart={swallow}
          >
            &lsaquo;
          </div>

          <div className="intro__car">
            <div key={carBody} className="intro__carname">
              {CAR_NAMES[carBody]}
            </div>
            <div className="intro__dots">
              {CAR_BODIES.map((b) => (
                <div key={b} className={b === carBody ? 'intro__dot intro__dot--on' : 'intro__dot'} />
              ))}
            </div>
          </div>

          <div
            className="intro__chev"
            role="button"
            tabIndex={-1}
            aria-label="next car"
            onPointerDown={pick(1)}
            onTouchStart={swallow}
          >
            &rsaquo;
          </div>
        </div>
        <div className="intro__garagehint">arrows or click to pick your ride</div>

        <div className="intro__go">press any key to drive</div>
      </div>
    </div>
  )
}
