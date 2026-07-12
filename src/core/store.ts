import { create } from 'zustand'
import { CONFIG } from './config'

export type CarBodyId = 'coupe' | 'striker' | 'muscle' | 'wedge'
export const CAR_BODIES: readonly CarBodyId[] = ['coupe', 'striker', 'muscle', 'wedge']

const CAR_BODY_KEY = 'sundown-run.carBody'

function loadCarBody(): CarBodyId {
  try {
    const v = localStorage.getItem(CAR_BODY_KEY)
    if (v && (CAR_BODIES as readonly string[]).includes(v)) return v as CarBodyId
  } catch {
    // storage unavailable (private mode) - fall through to config default
  }
  return CONFIG.carBody
}

function loadBestLap(): number | null {
  try {
    const v = parseFloat(localStorage.getItem('sundown-run.bestLapMs') ?? '')
    if (Number.isFinite(v) && v > 10_000) return v // a sub-10s "lap" is stale garbage
  } catch {
    // storage unavailable
  }
  return null
}

function loadNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const v = parseFloat(localStorage.getItem(key) ?? '')
    if (Number.isFinite(v)) return Math.min(max, Math.max(min, v))
  } catch {
    // storage unavailable - use the fallback
  }
  return fallback
}

// Low-frequency game state (React-reactive). Per-frame values live in
// core/telemetry.ts instead - never put a number that changes every frame here.

export type InputDevice = 'keyboard' | 'gamepad'

interface GameStore {
  inputDevice: InputDevice
  setInputDevice: (d: InputDevice) => void

  // car selection (runtime - the title-screen garage; CONFIG.carBody is the default)
  carBody: CarBodyId
  setCarBody: (b: CarBodyId) => void

  // steering sensitivity (runtime setting, persisted; CONFIG.steering is the default)
  steering: number
  setSteering: (v: number) => void

  // delights - shards scatter fresh every reset ("round"); found counts per round
  collectiblesTotal: number
  collectiblesFound: number
  setCollectiblesTotal: (n: number) => void
  foundCollectible: () => void
  resetCollectibles: () => void

  // shard hunt: the clock starts on the round's FIRST pickup and stops on the
  // last. huntStartedAt is a performance.now() timestamp (0 = not running).
  huntStartedAt: number
  huntLastMs: number | null
  huntBestMs: number | null
  huntStart: (now: number) => void
  huntFinish: (ms: number) => void

  // lap timing (road is a closed loop). A lap only completes if the ordered
  // sector checkpoints were all hit (anti tiny-circle / reverse cheat). A lap
  // with too much cumulative off-road time is "dirty": its time shows, but it
  // can never set bestLapMs (anti course-cut cheat, while off-road exploring
  // stays legal and unpunished).
  lapCount: number
  lastLapMs: number | null
  lastLapDirty: boolean
  bestLapMs: number | null
  /** live flag for the HUD: the lap in progress has gone dirty */
  currentLapDirty: boolean
  setCurrentLapDirty: (d: boolean) => void
  /** bumped when a line-crossing is rejected for skipped sectors (HUD toast) */
  lapVoidNonce: number
  voidLap: () => void
  completeLap: (ms: number, dirty: boolean) => void

  // reset-to-road signal: vehicle watches the nonce and teleports on change
  resetNonce: number
  requestReset: () => void

  // ghost lap: bumped whenever a new best-lap trace is committed, so the ghost
  // car re-reads the (possibly new-bodied) trace. The trace itself is NOT here -
  // it is per-frame replay data and lives in vehicle/ghost.ts, same discipline
  // as telemetry / carVisual. This is only the low-frequency "it changed" signal.
  ghostVersion: number
  bumpGhost: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  inputDevice: 'keyboard',
  setInputDevice: (d) => set((s) => (s.inputDevice === d ? s : { inputDevice: d })),

  steering: loadNumber('sundown-run.steering', CONFIG.steering, 0.6, 1.6),
  setSteering: (v) => {
    const clamped = Math.min(1.6, Math.max(0.6, v))
    try {
      localStorage.setItem('sundown-run.steering', String(clamped))
    } catch {
      // fine - just won't survive a reload
    }
    set({ steering: clamped })
  },

  carBody: loadCarBody(),
  setCarBody: (b) => {
    try {
      localStorage.setItem(CAR_BODY_KEY, b)
    } catch {
      // fine - selection just won't survive a reload
    }
    set({ carBody: b })
  },

  collectiblesTotal: 0,
  collectiblesFound: 0,
  setCollectiblesTotal: (n) => set({ collectiblesTotal: n }),
  foundCollectible: () => set((s) => ({ collectiblesFound: s.collectiblesFound + 1 })),
  resetCollectibles: () => set({ collectiblesFound: 0, huntStartedAt: 0 }),

  huntStartedAt: 0,
  huntLastMs: null,
  huntBestMs: loadNumber('sundown-run.bestShardHuntMs', 0, 0, Infinity) || null,
  huntStart: (now) => set({ huntStartedAt: now }),
  huntFinish: (ms) =>
    set((s) => {
      const best = s.huntBestMs === null || ms < s.huntBestMs ? ms : s.huntBestMs
      if (best !== s.huntBestMs) {
        try {
          localStorage.setItem('sundown-run.bestShardHuntMs', String(best))
        } catch {
          // fine - the record just won't survive a reload
        }
      }
      return { huntStartedAt: 0, huntLastMs: ms, huntBestMs: best }
    }),

  lapCount: 0,
  lastLapMs: null,
  lastLapDirty: false,
  bestLapMs: loadBestLap(),
  currentLapDirty: false,
  setCurrentLapDirty: (d) => set((s) => (s.currentLapDirty === d ? s : { currentLapDirty: d })),
  lapVoidNonce: 0,
  voidLap: () => set((s) => ({ lapVoidNonce: s.lapVoidNonce + 1, currentLapDirty: false })),
  completeLap: (ms, dirty) =>
    set((s) => {
      const best = dirty ? s.bestLapMs : s.bestLapMs === null || ms < s.bestLapMs ? ms : s.bestLapMs
      if (best !== s.bestLapMs) {
        try {
          localStorage.setItem('sundown-run.bestLapMs', String(best))
        } catch {
          // fine - the record just won't survive a reload
        }
      }
      return {
        lapCount: s.lapCount + 1,
        lastLapMs: ms,
        lastLapDirty: dirty,
        currentLapDirty: false,
        bestLapMs: best,
      }
    }),

  resetNonce: 0,
  requestReset: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),

  ghostVersion: 0,
  bumpGhost: () => set((s) => ({ ghostVersion: s.ghostVersion + 1 })),
}))
