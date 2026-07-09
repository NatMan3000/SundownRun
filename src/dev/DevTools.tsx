// Dev-only verification affordances (checkers depend on these):
//  - window.__game: { telemetry, renderInfo() } - live state for CDP probes
//  - ?demo=1: scripted autopilot lap segment (drive worker implements in
//    DemoDrive.tsx) recording frame times into window.__perf:
//    { running, done, frames, avgMs, p99Ms, fps }
//  - CONFIG.showFps: on-screen fps meter
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { telemetry } from '../core/telemetry'

declare global {
  interface Window {
    __game?: {
      telemetry: typeof telemetry
      renderInfo: () => { calls: number; triangles: number }
    }
    __perf?: {
      running: boolean
      done: boolean
      frames: number
      avgMs: number
      p99Ms: number
      fps: number
    }
  }
}

export function DevTools() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    window.__game = {
      telemetry,
      renderInfo: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles }),
    }
    return () => {
      delete window.__game
    }
  }, [gl])
  return null
}
