// The title screen. It is also the browser's autoplay gesture: whatever dismisses
// this card is the first user interaction, and that is where the AudioContext
// gets built.
//
// It self-dismisses once the car is actually moving, so the ?demo=1 autopilot
// never ends up screenshotting a title card.

import { useEffect, useLayoutEffect, useState } from 'react'
import { CONFIG } from '../core/config'
import { telemetry } from '../core/telemetry'
import * as audio from '../audio/AudioEngine'

const DRIVING_KMH = 3

export function IntroCard() {
  const [out, setOut] = useState(false)
  const [gone, setGone] = useState(false)

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

  useEffect(() => {
    if (out) {
      const id = setTimeout(() => setGone(true), 340) // outlives the 300ms fade
      return () => clearTimeout(id)
    }

    const dismiss = () => {
      audio.ensureStarted()
      setOut(true)
    }
    const opts: AddEventListenerOptions = { passive: true }
    window.addEventListener('keydown', dismiss, opts)
    window.addEventListener('pointerdown', dismiss, opts)
    window.addEventListener('touchstart', dismiss, opts)

    // A gamepad press raises no DOM event, and the autopilot raises none either.
    // If the car moves, the game has started - get out of the way.
    const poll = setInterval(() => {
      if (telemetry.speedKmh > DRIVING_KMH) setOut(true)
    }, 100)

    return () => {
      window.removeEventListener('keydown', dismiss, opts)
      window.removeEventListener('pointerdown', dismiss, opts)
      window.removeEventListener('touchstart', dismiss, opts)
      clearInterval(poll)
    }
  }, [out])

  if (gone) return null

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
            <b className="hud-key">R</b>
            <em>reset</em>
          </span>
        </div>
        <div className="intro__pad">gamepad: left stick &middot; triggers &middot; A handbrake &middot; Y reset</div>

        <div className="intro__go">press any key to drive</div>
      </div>
    </div>
  )
}
