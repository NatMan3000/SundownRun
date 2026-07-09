// Mounts the procedural audio engine into the r3f frame loop.
//
// The engine itself (AudioEngine.ts) is a module singleton so the HUD and the
// delights can fire one-shots without prop-drilling an audio context around.
// This component owns three things only: the per-frame update, the autoplay
// gesture, and the tab-visibility mute.

import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as audio from './AudioEngine'

declare global {
  interface Window {
    /** Dev probe: live values off the audio graph. See AudioEngine.debug(). */
    __audio?: {
      snapshot: () => audio.AudioDebug
      start: () => void
      isRunning: () => boolean
    }
  }
}

export function AudioSystem() {
  useEffect(() => {
    const removeGesture = audio.installGestureUnlock()
    const onVisibility = () => audio.setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)

    window.__audio = {
      snapshot: audio.debug,
      start: audio.ensureStarted,
      isRunning: audio.isRunning,
    }

    return () => {
      removeGesture()
      document.removeEventListener('visibilitychange', onVisibility)
      delete window.__audio
      audio.dispose()
    }
  }, [])

  useFrame(() => audio.update())

  return null
}
