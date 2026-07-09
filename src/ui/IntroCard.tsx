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
const DPAD_UP = 12
const DPAD_DOWN = 13
const DPAD_LEFT = 14
const DPAD_RIGHT = 15
const DPAD = [DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT]

// Steering sensitivity: matches the clamp in core/store's setSteering.
const STEER_MIN = 0.6
const STEER_MAX = 1.6
const STEER_STEP = 0.1
const STEER_TICKS = Math.round((STEER_MAX - STEER_MIN) / STEER_STEP) // 10 gaps, 11 stops

const round1 = (v: number) => Math.round(v * 10) / 10
const steerIndex = (v: number) => Math.round((round1(v) - STEER_MIN) / STEER_STEP)

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
  const steering = useGameStore((s) => s.steering)
  const steerIdx = steerIndex(steering)

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
    audio.playSelect(CAR_BODIES.indexOf(next) / (CAR_BODIES.length - 1))
  }, [])

  const bump = useCallback((dir: number) => {
    const s = useGameStore.getState()
    const cur = round1(s.steering)
    const next = round1(Math.min(STEER_MAX, Math.max(STEER_MIN, cur + dir * STEER_STEP)))
    if (next === cur) return // already against the rail: no move, no blip
    s.setSteering(next)
    audio.playSelect(steerIndex(next) / STEER_TICKS)
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
      switch (e.code) {
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown':
          // The garage owns the arrows while the card is up, and it claims them
          // in the CAPTURE phase so core/input's own window listener never sees
          // them. That matters: ArrowUp is throttle, and one blip of throttle
          // would push the car past DRIVING_KMH and dismiss the card out from
          // under the kid who was only trying to adjust the steering.
          e.stopPropagation()
          e.preventDefault()
          if (e.repeat) return // holding an arrow must not machine-gun the list
          if (e.code === 'ArrowLeft') cycle(-1)
          else if (e.code === 'ArrowRight') cycle(1)
          else bump(e.code === 'ArrowUp' ? 1 : -1)
          return
        default:
          dismissByGesture()
      }
    }

    // Not passive, and capture: we need preventDefault + stopPropagation above.
    // The AudioContext unlock also listens on window in the capture phase, and
    // stopPropagation does not stop other listeners on the same node - so the
    // arrows still start the audio, which is what makes the blip audible.
    const capture: AddEventListenerOptions = { capture: true }
    const opts: AddEventListenerOptions = { passive: true }
    window.addEventListener('keydown', onKeyDown, capture)
    window.addEventListener('pointerdown', dismissByGesture, opts)
    window.addEventListener('touchstart', dismissByGesture, opts)

    // A gamepad press raises no DOM event, and the autopilot raises none either.
    // Note a gamepad button is NOT a user gesture as far as the browser is
    // concerned, so this path never calls ensureStarted() - doing so would only
    // earn an "AudioContext was not allowed to start" warning in the console.
    const prev = [false, false, false, false] // up, down, left, right
    const poll = setInterval(() => {
      if (telemetry.speedKmh > DRIVING_KMH) {
        setOut(true)
        return
      }
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i]
        if (!p || !p.connected) continue

        // Rising edges only, so holding the dpad does not run away with the list.
        const now = DPAD.map((b) => p.buttons[b]?.pressed ?? false)
        if (now[0] && !prev[0]) bump(1) //    dpad up: twitchier
        if (now[1] && !prev[1]) bump(-1) //   dpad down: calmer
        if (now[2] && !prev[2]) cycle(-1)
        if (now[3] && !prev[3]) cycle(1)
        for (let k = 0; k < prev.length; k++) prev[k] = now[k]

        for (let b = 0; b < p.buttons.length; b++) {
          if (DPAD.includes(b)) continue
          if (p.buttons[b].pressed) {
            setOut(true)
            return
          }
        }
        break // first connected pad owns the garage
      }
    }, 80)

    return () => {
      window.removeEventListener('keydown', onKeyDown, capture)
      window.removeEventListener('pointerdown', dismissByGesture, opts)
      window.removeEventListener('touchstart', dismissByGesture, opts)
      clearInterval(poll)
    }
  }, [out, cycle, bump])

  if (gone) return null

  /** Swallow the event before it reaches the window dismiss listeners. */
  const pick = (dir: number) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    cycle(dir)
  }
  const nudge = (dir: number) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    bump(dir)
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
        {/* Steering sensitivity, same row grammar as the car above it. */}
        <div className="intro__garage intro__garage--steer">
          <div
            className="intro__chev intro__chev--pm"
            role="button"
            tabIndex={-1}
            aria-label="calmer steering"
            onPointerDown={nudge(-1)}
            onTouchStart={swallow}
          >
            &minus;
          </div>

          <div className="intro__steer">
            <div className="intro__steername">
              STEERING <b>{steering.toFixed(1)}</b>
            </div>
            <div className="intro__steertrack">
              <span>calm</span>
              <div className="intro__ticks">
                {Array.from({ length: STEER_TICKS + 1 }, (_, i) => (
                  <div key={i} className={i === steerIdx ? 'intro__tick intro__tick--on' : 'intro__tick'} />
                ))}
              </div>
              <span>twitchy</span>
            </div>
          </div>

          <div
            className="intro__chev intro__chev--pm"
            role="button"
            tabIndex={-1}
            aria-label="twitchier steering"
            onPointerDown={nudge(1)}
            onTouchStart={swallow}
          >
            +
          </div>
        </div>

        <div className="intro__garagehint">arrows or click to set up your ride</div>

        <div className="intro__go">press any key to drive</div>
      </div>
    </div>
  )
}
