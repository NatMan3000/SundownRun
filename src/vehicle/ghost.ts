// ============================================================
//  GHOST LAP - race a replay of your own best lap
// ------------------------------------------------------------
//  Two halves, split like the rest of the vehicle system:
//
//  RECORD (this file, the physics side)
//    While a lap is being timed, the physics step feeds the car's
//    pose in here at a FIXED 20Hz (every third 60Hz step). The
//    samples land in preallocated Float32Arrays - zero allocation
//    per step, ever. When a VALID lap completes AND beats the best,
//    the buffer is committed: copied into a compact trace and
//    persisted to localStorage. A void / dirty / reset lap is
//    discarded and the buffer reused.
//
//  REPLAY (GhostCar.tsx, the render side)
//    Reads `ghostTrace` and, time-synced to the player's live lap
//    clock, interpolates between samples to drive a translucent car.
//    No physics body, no collider - purely a moving object3D.
//
//  Lifecycle is driven by LapTracker (vehicle/lapTracker.ts), the
//  one place that already knows a lap has begun, gone dirty, been
//  voided, completed, or been teleported away. See the calls there.
//
//  WHY 20Hz, and why deterministic time. A sample's timestamp is
//  simply index / REC_HZ - the recorder never stores a clock. The
//  physics step is a fixed 1/60s, so decimating it by three is an
//  exact 20Hz grid. On replay the player's wall-clock lap time picks
//  the bracketing samples; the tiny step-vs-wall drift over a lap is
//  invisible on a translucent ghost. 20Hz interpolated is smooth for
//  a spectral car even at top speed (~2.6m between samples, lerped).
// ============================================================

import * as THREE from 'three'
import { useGameStore } from '../core/store'
import type { CarBodyId } from '../core/store'
import { CAR_BODIES } from '../core/store'

/** Samples per second. Physics is 60Hz, so this must divide 60 cleanly. */
export const REC_HZ = 20
const REC_EVERY = 60 / REC_HZ // record every Nth physics step
/** A lap longer than this simply is not going to be a best - stop recording it. */
const MAX_SECONDS = 300
const MAX_SAMPLES = REC_HZ * MAX_SECONDS // 6000 - buffers sized once, never grown

const STORAGE_KEY = 'sundown-run.ghostLap'
// Bumped to 2 when the start/finish line moved to START_LINE_T: a trace recorded
// against the old line geometry is not comparable, so loadGhost() below rejects any
// version mismatch and the old ghost is silently dropped.
const TRACE_VERSION = 2

// ---------- start-line move: one-shot wipe of stale persisted records ----------
//
// Moving the start/finish line (START_LINE_T in terrain.ts) invalidates every
// persisted record: a bestLapMs and a ghost trace were both measured against the old
// line, and there is no honest way to compare them to laps timed against the new one.
// Nathan's call: old times simply do not carry over. So the first boot after the move
// wipes them ONCE, guarded by an epoch marker. Bump START_LINE_EPOCH whenever the line
// moves again.
//
// This lives on the vehicle side (store.ts is not ours to edit). It clears the stored
// values AND resets the already-loaded in-memory bestLapMs via the store's public
// setState - store.ts reads localStorage at module-init, before this runs, so clearing
// storage alone would leave the stale best sitting in memory until a reload.
// Epoch 3: the hairpin + last corner were BANKED (terrain.ts BANKS) - a lap
// time or ghost driven on the flat corners is not comparable to the new track.
const START_LINE_EPOCH = 3
const EPOCH_KEY = 'sundown-run.lapEpoch'

function migrateStaleRecords(): void {
  try {
    const seen = parseInt(localStorage.getItem(EPOCH_KEY) ?? '', 10)
    if (seen === START_LINE_EPOCH) return
    localStorage.removeItem('sundown-run.bestLapMs')
    localStorage.removeItem(STORAGE_KEY)
    localStorage.setItem(EPOCH_KEY, String(START_LINE_EPOCH))
    // Correct the value store.ts already loaded this session (import order: store
    // initialises before this module, so its bestLapMs is the stale one right now).
    useGameStore.setState({ bestLapMs: null })
  } catch {
    // storage unavailable (private mode) - nothing persisted to migrate anyway
  }
}

// Runs once, at first import of this module (the vehicle physics pulls it in at boot).
migrateStaleRecords()

/**
 * A finished best-lap trace, ready to replay. Positions and quaternions are
 * split into flat Float32Arrays (index k spans [3k,3k+3) and [4k,4k+4)) so the
 * replay reads them by offset with no allocation.
 */
export interface GhostTrace {
  lapMs: number
  /** The car body that drove this lap - the ghost wears it, not the live garage pick. */
  body: CarBodyId
  hz: number
  count: number
  pos: Float32Array // 3 per sample: x, y, z
  quat: Float32Array // 4 per sample: x, y, z, w
}

// ---------- live replay state (mutable singleton, read by DevTools) ----------
// Same discipline as core/telemetry.ts: mutate in place, never replace.
export const ghostState = {
  /** A trace exists to race against. */
  hasTrace: false,
  /** The ghost is on screen and replaying right now. */
  playing: false,
  /** Samples in the loaded trace. */
  sampleCount: 0,
  /** The loaded trace's lap time, ms. */
  lapMs: null as number | null,
  /** Live world position of the ghost - lets a checker prove it moves and syncs. */
  position: new THREE.Vector3(),
}

// The one loaded trace. Null until a best lap has been recorded (this session or
// restored from a previous one). GhostCar reads it via getGhostTrace().
let ghostTrace: GhostTrace | null = null

export function getGhostTrace(): GhostTrace | null {
  return ghostTrace
}

function setGhostTrace(trace: GhostTrace | null): void {
  ghostTrace = trace
  ghostState.hasTrace = trace !== null
  ghostState.sampleCount = trace?.count ?? 0
  ghostState.lapMs = trace?.lapMs ?? null
}

// ---------- persistence ----------
// Stored compact: positions as centimetre integers, quaternion components as
// milli-unit integers. Integers keep the JSON free of decimal points, so a
// typical ~45s lap (900 samples) is a few tens of KB - comfortably small.

function isCarBody(v: unknown): v is CarBodyId {
  return typeof v === 'string' && (CAR_BODIES as readonly string[]).includes(v)
}

function saveGhost(trace: GhostTrace): void {
  const n = trace.count
  const p = new Array<number>(n * 3)
  const q = new Array<number>(n * 4)
  for (let i = 0; i < n * 3; i++) p[i] = Math.round(trace.pos[i] * 100)
  for (let i = 0; i < n * 4; i++) q[i] = Math.round(trace.quat[i] * 1000)
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: TRACE_VERSION, lapMs: trace.lapMs, body: trace.body, hz: trace.hz, n, p, q })
    )
  } catch {
    // storage unavailable (private mode) - the ghost just won't survive a reload
  }
}

/** Restore a stored best-lap trace at boot. Called once from GhostCar's mount. */
export function loadGhost(): GhostTrace | null {
  if (ghostTrace) return ghostTrace // already loaded this session
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || o.v !== TRACE_VERSION) return null
    const n: number = o.n
    if (!Number.isFinite(n) || n < 2) return null
    if (!Array.isArray(o.p) || !Array.isArray(o.q) || o.p.length < n * 3 || o.q.length < n * 4) return null
    const body: CarBodyId = isCarBody(o.body) ? o.body : 'coupe'
    const pos = new Float32Array(n * 3)
    const quat = new Float32Array(n * 4)
    for (let i = 0; i < n * 3; i++) pos[i] = o.p[i] / 100
    for (let i = 0; i < n * 4; i++) quat[i] = o.q[i] / 1000
    const hz = Number.isFinite(o.hz) ? o.hz : REC_HZ
    const trace: GhostTrace = { lapMs: o.lapMs, body, hz, count: n, pos, quat }
    setGhostTrace(trace)
    return trace
  } catch {
    return null
  }
}

// ---------- the recorder (singleton - there is one car) ----------

class GhostRecorder {
  // Buffers allocated ONCE. Recording writes into them; commit copies out.
  private readonly pos = new Float32Array(MAX_SAMPLES * 3)
  private readonly quat = new Float32Array(MAX_SAMPLES * 4)
  private count = 0
  private active = false
  private phase = 0 // 0 -> record on this step, cycles 0..REC_EVERY-1
  private body: CarBodyId = 'coupe'

  /** A fresh lap has begun - start recording from sample 0. */
  start(): void {
    this.active = true
    this.count = 0
    this.phase = 0 // the next sample() call, this same step, lands sample 0
    this.body = useGameStore.getState().carBody
  }

  /** Stop and throw away the in-progress recording (void / dirty / reset). */
  discard(): void {
    this.active = false
    this.count = 0
  }

  /**
   * Fed the raw physics pose every 60Hz step. Records every REC_EVERY-th step.
   * Hot path: a boolean check when idle, and a handful of array writes at 20Hz.
   * No allocation.
   */
  sample(p: THREE.Vector3, q: THREE.Quaternion): void {
    if (!this.active) return
    if (this.phase === 0) {
      const c = this.count
      if (c >= MAX_SAMPLES) {
        // Overran MAX_SECONDS - this lap cannot be a best, so stop wasting writes.
        this.active = false
        return
      }
      const pi = c * 3
      const qi = c * 4
      this.pos[pi] = p.x
      this.pos[pi + 1] = p.y
      this.pos[pi + 2] = p.z
      this.quat[qi] = q.x
      this.quat[qi + 1] = q.y
      this.quat[qi + 2] = q.z
      this.quat[qi + 3] = q.w
      this.count = c + 1
    }
    this.phase = (this.phase + 1) % REC_EVERY
  }

  /**
   * The lap just completed as a new best. Copy the buffer into a trace, make it
   * the ghost, and persist it. Returns true if a usable trace was produced.
   */
  commit(lapMs: number): boolean {
    const n = this.count
    this.active = false
    if (n < 2) return false // nothing worth replaying
    const pos = new Float32Array(n * 3)
    const quat = new Float32Array(n * 4)
    pos.set(this.pos.subarray(0, n * 3))
    quat.set(this.quat.subarray(0, n * 4))
    const trace: GhostTrace = { lapMs, body: this.body, hz: REC_HZ, count: n, pos, quat }
    setGhostTrace(trace)
    saveGhost(trace)
    if (import.meta.env.DEV) {
      console.info(`[ghost] recorded best lap ${(lapMs / 1000).toFixed(2)}s - ${n} samples, body=${trace.body}`)
    }
    return true
  }
}

export const ghostRecorder = new GhostRecorder()
