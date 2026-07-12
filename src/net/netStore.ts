// ============================================================
//  NET STORE - low-frequency multiplayer state (React-reactive)
// ------------------------------------------------------------
//  Same split as core/store.ts vs core/telemetry.ts: things that
//  change rarely (who is connected, their name and lap times) live
//  here and re-render the HUD normally; the 60Hz pose stream never
//  touches this store - it lives in net.ts as mutable ring buffers.
// ============================================================

import { create } from 'zustand'
import type { NetCarBody } from './protocol'

export type NetStatus = 'off' | 'connecting' | 'waiting' | 'racing'

export interface PeerInfo {
  id: number
  name: string
  body: NetCarBody
  color: string
  lastLapMs: number | null
  bestLapMs: number | null
  trickScore: number
}

export interface NetEvent {
  kind: 'join' | 'leave'
  name: string
}

interface NetStore {
  status: NetStatus
  /** Peers that have said hello - keyed by relay id. Only these get a car. */
  peers: Record<number, PeerInfo>
  /** Join/leave announcements for HUD toasts - nonce bumps on every event. */
  eventNonce: number
  lastEvent: NetEvent | null

  /** Race result announcement - "KAI-B WINS!" toast material. */
  raceResultNonce: number
  raceResult: { name: string; ms: number } | null

  setStatus: (s: NetStatus) => void
  setRaceResult: (name: string, ms: number) => void
  upsertPeer: (p: PeerInfo, announce: boolean) => void
  updatePeerStats: (
    id: number,
    stats: { lastLapMs: number | null; bestLapMs: number | null; trickScore: number }
  ) => void
  removePeer: (id: number) => void
  clearPeers: () => void
}

export const useNetStore = create<NetStore>((set) => ({
  status: 'off',
  peers: {},
  eventNonce: 0,
  lastEvent: null,
  raceResultNonce: 0,
  raceResult: null,

  setStatus: (status) => set((s) => (s.status === status ? s : { status })),

  setRaceResult: (name, ms) =>
    set((s) => ({ raceResultNonce: s.raceResultNonce + 1, raceResult: { name, ms } })),

  upsertPeer: (p, announce) =>
    set((s) => {
      const existing = s.peers[p.id]
      const peers = { ...s.peers, [p.id]: { ...existing, ...p } }
      const anyPeers = Object.keys(peers).length > 0
      return {
        peers,
        status: s.status === 'off' ? s.status : anyPeers ? 'racing' : s.status,
        // Announce only a genuinely new arrival, not a re-hello (garage change).
        ...(announce && !existing
          ? { eventNonce: s.eventNonce + 1, lastEvent: { kind: 'join' as const, name: p.name } }
          : null),
      }
    }),

  updatePeerStats: (id, stats) =>
    set((s) => {
      const peer = s.peers[id]
      if (!peer) return s
      return { peers: { ...s.peers, [id]: { ...peer, ...stats } } }
    }),

  removePeer: (id) =>
    set((s) => {
      const peer = s.peers[id]
      if (!peer) return s
      const peers = { ...s.peers }
      delete peers[id]
      const anyPeers = Object.keys(peers).length > 0
      return {
        peers,
        status: s.status === 'racing' && !anyPeers ? 'waiting' : s.status,
        eventNonce: s.eventNonce + 1,
        lastEvent: { kind: 'leave' as const, name: peer.name },
      }
    }),

  clearPeers: () => set({ peers: {} }),
}))
