// Dev-only verification affordances (checkers depend on these):
//  - window.__game: { telemetry, renderInfo() } - live state for CDP probes
//  - ?demo=1: scripted autopilot lap segment (DemoDrive.tsx) recording frame
//    times into window.__perf: { running, done, frames, avgMs, p99Ms, fps }
//  - CONFIG.showFps: on-screen fps meter (plain DOM, rAF, no React state)
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { CONFIG } from '../core/config'
import { telemetry } from '../core/telemetry'
import { getTerrainHeight } from '../core/terrain'
import { carVisual } from '../vehicle/carVisual'
import { DemoDrive } from './DemoDrive'

declare global {
  interface Window {
    __game?: {
      telemetry: typeof telemetry
      renderInfo: () => { calls: number; triangles: number }
      /** Suspension + body articulation, for probing ride height / wheel travel. */
      carVisual: typeof carVisual
      terrainHeight: (x: number, z: number) => number
    }
    __perf?: {
      running: boolean
      done: boolean
      frames: number
      /** Main-thread COST of a frame. This is what the 12ms / 16.6ms budget means. */
      avgMs: number
      p99Ms: number
      /** Frames per second actually delivered, from wall-clock deltas. */
      fps: number
      /** Wall-clock gap between frames. Pinned near 16.67ms whenever vsync is on. */
      deltaAvgMs?: number
      deltaP99Ms?: number
      vsyncLocked?: boolean
      /** Frames before this point are discarded: shader compile is not the game. */
      warmupMs?: number
      /** Length of the measured window. */
      windowMs?: number
    }
  }
}

function FpsMeter() {
  useEffect(() => {
    if (!CONFIG.showFps) return
    const el = document.createElement('div')
    el.style.cssText = [
      'position:fixed',
      'top:8px',
      'left:8px',
      'z-index:9999',
      'padding:3px 7px',
      'font:600 12px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#FFD9A8',
      'background:rgba(20,16,12,0.55)',
      'border-radius:4px',
      'pointer-events:none',
      'letter-spacing:0.02em',
    ].join(';')
    el.textContent = '-- fps'
    document.body.appendChild(el)

    let raf = 0
    let count = 0
    let last = performance.now()
    const tick = (now: number) => {
      count++
      const dt = now - last
      if (dt >= 250) {
        el.textContent = `${Math.round((count * 1000) / dt)} fps`
        count = 0
        last = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      el.remove()
    }
  }, [])
  return null
}

export function DevTools() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    window.__game = {
      telemetry,
      renderInfo: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles }),
      carVisual,
      terrainHeight: getTerrainHeight,
    }
    return () => {
      delete window.__game
    }
  }, [gl])

  return (
    <>
      <FpsMeter />
      <DemoDrive />
    </>
  )
}
