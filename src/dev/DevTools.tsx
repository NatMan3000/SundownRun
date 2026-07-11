// Dev-only verification affordances (checkers depend on these):
//  - window.__game: telemetry, renderInfo(), carVisual, terrainHeight(), the live
//    camera fov, live lap state (lapCount / lastLapMs / bestLapMs / lastLapDirty)
//    and the lap-validity surface (sectorsPassed / sectorMask / offRoadMsThisLap /
//    currentLapDirty / lapVoidNonce / lapElapsedMs / lapArmed).
//    All of those are GETTERS - read them at the moment you need them, do not
//    snapshot the object and expect it to keep updating.
//  - ?demo=1: scripted autopilot lap segment (DemoDrive.tsx) recording frame
//    times into window.__perf: { running, done, frames, avgMs, p99Ms, fps }
//  - CONFIG.showFps: on-screen fps meter (plain DOM, rAF, no React state)
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CONFIG } from '../core/config'
import { telemetry } from '../core/telemetry'
import { ROAD_LENGTH, getTerrainHeight, roadSpline } from '../core/terrain'
import { useGameStore } from '../core/store'
import { carVisual } from '../vehicle/carVisual'
import { cameraState } from '../vehicle/cameraMode'
import { lapState } from '../vehicle/lapTracker'
import { ghostState } from '../vehicle/ghost'
import { DemoDrive } from './DemoDrive'

declare global {
  interface Window {
    __game?: {
      telemetry: typeof telemetry
      renderInfo: () => { calls: number; triangles: number }
      /** Suspension + body articulation, for probing ride height / wheel travel. */
      carVisual: typeof carVisual
      terrainHeight: (x: number, z: number) => number
      /** Live lap state, straight off useGameStore. */
      readonly lapCount: number
      readonly lastLapMs: number | null
      readonly bestLapMs: number | null
      /** True when the LAST completed lap was dirty (it can never have set a best). */
      readonly lastLapDirty: boolean
      /** True when the lap IN PROGRESS has spent its off-road grace. */
      readonly currentLapDirty: boolean
      /** Bumped each time a line crossing is rejected for skipped sectors. */
      readonly lapVoidNonce: number
      /** Latest sampled spline parameter, 0..1. The start line is t = 0. */
      readonly splineT: number
      /** Ordered checkpoints (t = k/8) behind the car on the current lap, 0..8. */
      readonly sectorsPassed: number
      readonly sectorCount: number
      /** Bitfield of passed checkpoints - bit k is the checkpoint at t = k/8. */
      readonly sectorMask: number
      /** Cumulative off-road milliseconds accrued on the current lap. */
      readonly offRoadMsThisLap: number
      /** Milliseconds since the lap in progress started. 0 while unarmed. */
      readonly lapElapsedMs: number
      /** False between a reset and the next line crossing - nothing is being timed. */
      readonly lapArmed: boolean
      /** Live vertical FOV of the chase camera, degrees. */
      readonly fov: number
      /** Active camera mode: 'chase' | 'close' | 'bonnet'. Cycled with C / RB. */
      readonly cameraMode: string
      /** 0..1 progress of the ease between modes; 1 = settled. */
      readonly cameraTransition: number
      /** Live world position of the camera - lets a checker prove it never snaps. */
      readonly cameraPos: [number, number, number]
      /** Ghost lap: a best-lap trace is loaded and available to race. */
      readonly ghostHasTrace: boolean
      /** Ghost lap: the ghost car is on screen and replaying right now. */
      readonly ghostPlaying: boolean
      /** Ghost lap: samples in the loaded trace (20Hz), and the trace's lap time. */
      readonly ghostSamples: number
      readonly ghostLapMs: number | null
      /** Ghost lap: live world position of the ghost car - proves it moves + syncs. */
      readonly ghostPos: [number, number, number]
      /** Runtime steering knob, 0.6..1.6 (persisted). Settable for verification. */
      steering: number
      setSteering: (v: number) => void
      /** Road spline sampling - lets a checker drive the track without the autopilot. */
      roadLength: number
      roadPointAt: (t: number) => [number, number, number]
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
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    window.__game = {
      telemetry,
      renderInfo: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles }),
      carVisual,
      terrainHeight: getTerrainHeight,
      // Getters, so a checker reads the value at the instant it asks - a snapshot
      // taken once at boot would report lapCount 0 forever.
      get lapCount() {
        return useGameStore.getState().lapCount
      },
      get lastLapMs() {
        return useGameStore.getState().lastLapMs
      },
      get bestLapMs() {
        return useGameStore.getState().bestLapMs
      },
      get lastLapDirty() {
        return useGameStore.getState().lastLapDirty
      },
      get currentLapDirty() {
        return useGameStore.getState().currentLapDirty
      },
      get lapVoidNonce() {
        return useGameStore.getState().lapVoidNonce
      },
      get splineT() {
        return lapState.splineT
      },
      get sectorsPassed() {
        return lapState.sectorsPassed
      },
      get sectorCount() {
        return lapState.sectorCount
      },
      get sectorMask() {
        return lapState.sectorMask
      },
      get offRoadMsThisLap() {
        return lapState.offRoadMsThisLap
      },
      get lapElapsedMs() {
        return lapState.lapElapsedMs
      },
      get lapArmed() {
        return lapState.armed
      },
      get fov() {
        return (camera as THREE.PerspectiveCamera).fov
      },
      get cameraMode() {
        return cameraState.mode
      },
      get cameraTransition() {
        return cameraState.transition
      },
      get cameraPos(): [number, number, number] {
        return [camera.position.x, camera.position.y, camera.position.z]
      },
      get ghostHasTrace() {
        return ghostState.hasTrace
      },
      get ghostPlaying() {
        return ghostState.playing
      },
      get ghostSamples() {
        return ghostState.sampleCount
      },
      get ghostLapMs() {
        return ghostState.lapMs
      },
      get ghostPos(): [number, number, number] {
        return [ghostState.position.x, ghostState.position.y, ghostState.position.z]
      },
      get steering() {
        return useGameStore.getState().steering
      },
      setSteering: (v: number) => useGameStore.getState().setSteering(v),
      roadLength: ROAD_LENGTH,
      roadPointAt: (t: number) => {
        const p = roadSpline.getPointAt(((t % 1) + 1) % 1)
        return [p.x, p.y, p.z]
      },
    }
    return () => {
      delete window.__game
    }
  }, [gl, camera])

  return (
    <>
      <FpsMeter />
      <DemoDrive />
    </>
  )
}
