import { create } from 'zustand'

// Low-frequency game state (React-reactive). Per-frame values live in
// core/telemetry.ts instead - never put a number that changes every frame here.

export type InputDevice = 'keyboard' | 'gamepad'

interface GameStore {
  inputDevice: InputDevice
  setInputDevice: (d: InputDevice) => void

  // delights
  collectiblesTotal: number
  collectiblesFound: number
  setCollectiblesTotal: (n: number) => void
  foundCollectible: () => void

  // lap timing (road is a closed loop)
  lapCount: number
  lastLapMs: number | null
  bestLapMs: number | null
  completeLap: (ms: number) => void

  // reset-to-road signal: vehicle watches the nonce and teleports on change
  resetNonce: number
  requestReset: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  inputDevice: 'keyboard',
  setInputDevice: (d) => set((s) => (s.inputDevice === d ? s : { inputDevice: d })),

  collectiblesTotal: 0,
  collectiblesFound: 0,
  setCollectiblesTotal: (n) => set({ collectiblesTotal: n }),
  foundCollectible: () => set((s) => ({ collectiblesFound: s.collectiblesFound + 1 })),

  lapCount: 0,
  lastLapMs: null,
  bestLapMs: null,
  completeLap: (ms) =>
    set((s) => ({
      lapCount: s.lapCount + 1,
      lastLapMs: ms,
      bestLapMs: s.bestLapMs === null || ms < s.bestLapMs ? ms : s.bestLapMs,
    })),

  resetNonce: 0,
  requestReset: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),
}))
