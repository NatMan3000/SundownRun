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

// Low-frequency game state (React-reactive). Per-frame values live in
// core/telemetry.ts instead - never put a number that changes every frame here.

export type InputDevice = 'keyboard' | 'gamepad'

interface GameStore {
  inputDevice: InputDevice
  setInputDevice: (d: InputDevice) => void

  // car selection (runtime - the title-screen garage; CONFIG.carBody is the default)
  carBody: CarBodyId
  setCarBody: (b: CarBodyId) => void

  // delights
  collectiblesTotal: number
  collectiblesFound: number
  setCollectiblesTotal: (n: number) => void
  foundCollectible: () => void

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
}

export const useGameStore = create<GameStore>((set) => ({
  inputDevice: 'keyboard',
  setInputDevice: (d) => set((s) => (s.inputDevice === d ? s : { inputDevice: d })),

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

  lapCount: 0,
  lastLapMs: null,
  lastLapDirty: false,
  bestLapMs: null,
  currentLapDirty: false,
  setCurrentLapDirty: (d) => set((s) => (s.currentLapDirty === d ? s : { currentLapDirty: d })),
  lapVoidNonce: 0,
  voidLap: () => set((s) => ({ lapVoidNonce: s.lapVoidNonce + 1, currentLapDirty: false })),
  completeLap: (ms, dirty) =>
    set((s) => ({
      lapCount: s.lapCount + 1,
      lastLapMs: ms,
      lastLapDirty: dirty,
      currentLapDirty: false,
      bestLapMs: dirty ? s.bestLapMs : s.bestLapMs === null || ms < s.bestLapMs ? ms : s.bestLapMs,
    })),

  resetNonce: 0,
  requestReset: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),
}))
