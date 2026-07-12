// ============================================================
//  NET SYSTEM - connection lifecycle + the outbound stream
// ------------------------------------------------------------
//  Renders nothing. Mounted (inside the Canvas, so useFrame works)
//  only when ?mp=1 is on the URL. Owns three jobs:
//
//  1. Connect to the relay on mount, disconnect on unmount.
//  2. Stream the local car's pose at ~60Hz - read straight off
//     core/telemetry (the interpolated render pose the camera already
//     uses), so the vehicle physics module needs zero changes.
//  3. Announce identity (hello - re-sent when the garage swaps bodies)
//     and low-frequency stats (lap times + trick score, 2Hz, only on
//     change).
// ============================================================

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import { CONFIG } from '../core/config'
import { useGameStore } from '../core/store'
import { telemetry } from '../core/telemetry'
import { tricksState } from '../core/tricks'
import { vehicleSignals } from '../vehicle/vehicleSignals'
import { connect, disconnect, peerPoses, playerColor, playerName, sendHello, sendPose, sendStats } from './net'
import { useNetStore } from './netStore'

const SEND_HZ = 60
const SEND_MS = 1000 / SEND_HZ
const STATS_MS = 500

declare global {
  interface Window {
    /** Dev probe: live net state, same spirit as __game / __hud. */
    __net?: { store: typeof useNetStore; peerPoses: typeof peerPoses }
  }
}

export function NetSystem() {
  const lastPoseSend = useRef(0)

  useEffect(() => {
    connect()
    window.__net = { store: useNetStore, peerPoses }

    const name = playerName()
    const color = playerColor(CONFIG.carColor)
    sendHello({ t: 'hello', name, body: useGameStore.getState().carBody, color })

    // Garage swap mid-session: tell everyone the new body.
    const unsub = useGameStore.subscribe((s, prev) => {
      if (s.carBody !== prev.carBody) sendHello({ t: 'hello', name, body: s.carBody, color })
    })

    // Stats on change only - lap times move a few times a minute, the trick
    // score in bursts. 2Hz poll, string compare, silence when idle... except a
    // forced resend every ~10s: a hidden tab stops streaming poses (rAF is
    // paused) and would otherwise trip the relay's 30s idleTimeout, making the
    // player flicker out of and back into everyone's roster. Timers still run
    // in hidden tabs, so this doubles as the keepalive.
    let lastStats = ''
    let ticksSinceSend = 0
    const statsTimer = setInterval(() => {
      const s = useGameStore.getState()
      const msg = {
        t: 'stats' as const,
        lastLapMs: s.lastLapMs,
        bestLapMs: s.bestLapMs,
        trickScore: Math.round(tricksState.sessionScore),
      }
      const key = `${msg.lastLapMs}|${msg.bestLapMs}|${msg.trickScore}`
      ticksSinceSend++
      if (key === lastStats && ticksSinceSend < 20) return
      ticksSinceSend = 0
      lastStats = key
      sendStats(msg)
    }, STATS_MS)

    return () => {
      clearInterval(statsTimer)
      unsub()
      disconnect()
      delete window.__net
    }
  }, [])

  useFrame(() => {
    if (!vehicleSignals.ready) return
    const now = performance.now()
    if (now - lastPoseSend.current < SEND_MS) return
    lastPoseSend.current = now
    sendPose(telemetry.carPosition, telemetry.carQuaternion, telemetry.speedKmh)
  })

  return null
}
