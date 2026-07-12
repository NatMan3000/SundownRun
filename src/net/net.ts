// ============================================================
//  NET CLIENT - the WebSocket, the pose buffers, the send path
// ------------------------------------------------------------
//  Multiplayer is opt-in via the URL: ?mp=1 (bun run mp prints ready-made
//  links). The client connects to ws://<same host>:5200 - the machine that
//  serves the game page also runs the relay, so location.hostname is always
//  the right address on both machines, with zero configuration.
//
//  POSE RECEIVE PATH (the 60Hz side - no React, no allocation):
//  each peer gets a PoseBuffer ring of the last 32 snapshots, stamped with
//  LOCAL arrival time. RemoteCar samples the ring at (now - INTERP_MS),
//  interpolating between the bracketing snapshots exactly like GhostCar
//  samples its trace. Sender timestamps never cross the wire - two machines'
//  clocks don't agree, arrival time on a LAN is honest enough.
//
//  Reconnects forever with a fixed short backoff: a kid restarting the relay
//  (or the host machine napping) should heal without anyone touching a thing.
// ============================================================

import * as THREE from 'three'
import { CONFIG } from '../core/config'
import { propsSignal } from '../core/propsSignal'
import { raceSignal } from '../vehicle/vehicleSignals'
import { useNetStore } from './netStore'
import type { PeerInfo } from './netStore'
import {
  POSE_BYTES,
  POSE_FLOATS,
  RELAY_PORT,
  TAGGED_POSE_BYTES,
  encodePose,
} from './protocol'
import type { ClientMsg, HelloMsg, RelayMsg } from './protocol'

/** How far behind live the remote car renders. Two 30Hz-ish sends of margin -
 *  small enough that a ram still connects where you aimed it. */
export const INTERP_MS = 80
/** No packet for this long -> the peer's tab is hidden or wedged; park the car. */
export const STALE_MS = 2000

// ---------- enable / identity (URL is the per-machine channel; the repo's
// config.ts is shared by both machines via the dev server, so it cannot be) ----------

const params = new URLSearchParams(window.location.search)

export function mpEnabled(): boolean {
  return params.get('mp') === '1'
}

const NAME_KEY = 'sundown-run.playerName'

export function playerName(): string {
  const fromUrl = params.get('name')
  if (fromUrl) {
    const name = fromUrl.slice(0, 14).toUpperCase()
    try {
      localStorage.setItem(NAME_KEY, name)
    } catch {
      // fine - just won't stick for next time
    }
    return name
  }
  try {
    const stored = localStorage.getItem(NAME_KEY)
    if (stored) return stored
  } catch {
    // storage unavailable
  }
  // Stable-ish default so two anonymous machines still read differently.
  const name = `RACER ${Math.floor(100 + Math.random() * 900)}`
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // fine
  }
  return name
}

/** Optional paint override (?color=red or ?color=%23FF6D22) - the repo config's
 *  carColor is identical on both machines, so a URL knob keeps the cars apart. */
export function playerColor(defaultColor: string): string {
  return params.get('color') ?? defaultColor
}

// The override applies to OUR OWN car too (module scope: runs before the first
// render reads CONFIG.carColor). Without this, ?color=red would paint you red
// on your mate's screen while you still see config blue - pure gaslighting.
if (mpEnabled()) {
  const c = params.get('color')
  if (c) (CONFIG as { carColor: string }).carColor = c
}

// ---------- pose ring buffer (per peer) ----------

const RING = 32

const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()

export class PoseBuffer {
  private times = new Float64Array(RING)
  private data = new Float32Array(RING * POSE_FLOATS)
  private count = 0
  /** index of the NEWEST sample */
  private head = -1

  push(tRecv: number, pose: Float32Array): void {
    this.head = (this.head + 1) % RING
    if (this.count < RING) this.count++
    this.times[this.head] = tRecv
    this.data.set(pose, this.head * POSE_FLOATS)
  }

  get lastRecv(): number {
    return this.count === 0 ? 0 : this.times[this.head]
  }

  get speedKmh(): number {
    return this.count === 0 ? 0 : this.data[this.head * POSE_FLOATS + 7]
  }

  /**
   * Interpolated pose at wall-time `t`. Walks back from the newest snapshot to
   * find the bracketing pair (<= 32 steps). Before the oldest -> oldest; after
   * the newest -> newest held (no extrapolation - a held car beats a car that
   * sails through a cliff on a guess).
   */
  sample(t: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion): boolean {
    if (this.count === 0) return false

    let newer = this.head
    let older = this.head
    for (let step = 0; step < this.count - 1; step++) {
      const prev = (newer - 1 + RING) % RING
      if (this.times[newer] <= t) break
      older = prev
      if (this.times[prev] <= t) break
      newer = prev
    }

    const iN = newer * POSE_FLOATS
    if (older === newer || this.times[newer] <= t) {
      // clamped to an end of the buffer
      const i = this.times[newer] <= t ? iN : older * POSE_FLOATS
      outPos.set(this.data[i], this.data[i + 1], this.data[i + 2])
      outQuat.set(this.data[i + 3], this.data[i + 4], this.data[i + 5], this.data[i + 6])
      return true
    }

    const iO = older * POSE_FLOATS
    const t0 = this.times[older]
    const t1 = this.times[newer]
    const a = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1
    outPos.set(
      this.data[iO] + (this.data[iN] - this.data[iO]) * a,
      this.data[iO + 1] + (this.data[iN + 1] - this.data[iO + 1]) * a,
      this.data[iO + 2] + (this.data[iN + 2] - this.data[iO + 2]) * a
    )
    _qa.set(this.data[iO + 3], this.data[iO + 4], this.data[iO + 5], this.data[iO + 6])
    _qb.set(this.data[iN + 3], this.data[iN + 4], this.data[iN + 5], this.data[iN + 6])
    outQuat.slerpQuaternions(_qa, _qb, a)
    return true
  }
}

/** Per-frame side of the peer map - RemoteCar reads this, never the store. */
export const peerPoses = new Map<number, PoseBuffer>()

// ---------- connection ----------

let ws: WebSocket | null = null
let wantOpen = false
let retryTimer: ReturnType<typeof setTimeout> | null = null
let helloMsg: HelloMsg | null = null
let statsMsg: ClientMsg | null = null
/** Our relay-assigned id (from the welcome message). Decides the start-grid slot. */
let myId = 0

const _sendBuf = new Float32Array(POSE_FLOATS)
const _taggedView = new Float32Array(POSE_FLOATS) // scratch for incoming poses

export function connect(): void {
  wantOpen = true
  open()
}

export function disconnect(): void {
  wantOpen = false
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = null
  ws?.close()
  ws = null
  peerPoses.clear()
  raceSignal.active = false
  useNetStore.getState().clearPeers()
  useNetStore.getState().setStatus('off')
}

function open(): void {
  if (!wantOpen || (ws && ws.readyState <= WebSocket.OPEN)) return
  useNetStore.getState().setStatus('connecting')

  const sock = new WebSocket(`ws://${window.location.hostname}:${RELAY_PORT}`)
  sock.binaryType = 'arraybuffer'
  ws = sock

  sock.onopen = () => {
    useNetStore.getState().setStatus('waiting')
    // (Re)introduce ourselves and replay current stats after any reconnect.
    if (helloMsg) sock.send(JSON.stringify(helloMsg))
    if (statsMsg) sock.send(JSON.stringify(statsMsg))
  }

  sock.onmessage = (ev) => {
    if (ev.data instanceof ArrayBuffer) {
      if (ev.data.byteLength !== TAGGED_POSE_BYTES) return
      const id = new DataView(ev.data).getUint32(0, true)
      _taggedView.set(new Float32Array(ev.data, 4, POSE_FLOATS))
      let buf = peerPoses.get(id)
      if (!buf) {
        buf = new PoseBuffer()
        peerPoses.set(id, buf)
      }
      buf.push(performance.now(), _taggedView)
      return
    }
    let msg: RelayMsg
    try {
      msg = JSON.parse(String(ev.data))
    } catch {
      return
    }
    handleMsg(msg)
  }

  // A reload/navigate can abandon the socket without a close frame, leaving a
  // zombie player on the relay until its idleTimeout reaps it. Close cleanly.
  window.addEventListener('pagehide', () => sock.close(), { once: true })

  sock.onclose = () => {
    if (ws !== sock) return
    ws = null
    peerPoses.clear()
    useNetStore.getState().clearPeers()
    if (!wantOpen) return
    useNetStore.getState().setStatus('connecting')
    retryTimer = setTimeout(open, 2000)
  }
  // onerror always precedes onclose - the close handler owns recovery
}

function peerFromHello(id: number, hello: HelloMsg): PeerInfo {
  return {
    id,
    name: hello.name,
    body: hello.body,
    color: hello.color,
    lastLapMs: null,
    bestLapMs: null,
    trickScore: 0,
  }
}

function handleMsg(msg: RelayMsg): void {
  const store = useNetStore.getState()
  switch (msg.t) {
    case 'welcome':
      myId = msg.id
      // Peers already in the room - no join fanfare for people who were here first.
      for (const p of msg.peers) {
        if (p.hello) store.upsertPeer(peerFromHello(p.id, p.hello), false)
      }
      break
    case 'join':
      // A connection, not yet a car - the peer appears when its hello lands.
      break
    case 'leave':
      peerPoses.delete(msg.id)
      store.removePeer(msg.id)
      break
    case 'hello':
      store.upsertPeer(peerFromHello(msg.from, msg), true)
      break
    case 'stats':
      store.updatePeerStats(msg.from, {
        lastLapMs: msg.lastLapMs,
        bestLapMs: msg.bestLapMs,
        trickScore: msg.trickScore,
      })
      break
    case 'race':
      startRaceCountdown(msg.raceId, msg.round)
      break
    case 'raceWin': {
      if (!raceSignal.active || msg.raceId !== raceSignal.raceId) break
      raceSignal.active = false
      const winner = store.peers[msg.from]
      store.setRaceResult(winner ? winner.name : 'THEY', msg.ms)
      break
    }
    case 'prop':
      // Only apply bursts from the same deal of the props - a message that
      // straddles a race start refers to a layout that no longer exists.
      if (msg.round === propsSignal.round) {
        propsSignal.pending.push({ f: msg.f, i: msg.i, vx: msg.vx, vz: msg.vz, speed: msg.speed })
      }
      break
  }
}

// ---------- synced race ----------

const COUNTDOWN_MS = 3300
const GRID_SPACING_M = 3.4

/**
 * Line everyone up and count down. Called for both the local initiator and a
 * received race message - LAN latency means both machines start within a few
 * milliseconds, which is far tighter than human reaction time.
 *
 * The grid slot is derived from sorted relay ids, so every machine computes
 * the same grid without negotiating.
 */
export function startRaceCountdown(raceId: number, round: number): void {
  const now = performance.now()
  if (now < raceSignal.goAt) return // already counting down - first race wins
  const ids = [myId, ...Object.keys(useNetStore.getState().peers).map(Number)].sort((a, b) => a - b)
  const slot = Math.max(0, ids.indexOf(myId))
  raceSignal.slot = (slot - (ids.length - 1) / 2) * GRID_SPACING_M
  raceSignal.raceId = raceId
  raceSignal.goAt = now + COUNTDOWN_MS
  raceSignal.active = true
  raceSignal.nonce++
  // Fresh shared deal of the crash props for this race.
  propsSignal.round = round
  propsSignal.pending.length = 0
}

/** Local race trigger (G / pad X). Broadcasts, then starts the same countdown. */
export function requestRace(): void {
  if (performance.now() < raceSignal.goAt) return
  if (ws?.readyState !== WebSocket.OPEN) return
  const raceId = (Math.random() * 0x7fffffff) | 0
  const round = (Math.random() * 0x7fffffff) | 0
  ws.send(JSON.stringify({ t: 'race', raceId, round }))
  startRaceCountdown(raceId, round)
}

/** Local lap completed while a race is live - claim the win, tell the room. */
export function reportRaceWin(ms: number): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ t: 'raceWin', raceId: raceSignal.raceId, ms }))
  }
  useNetStore.getState().setRaceResult('YOU', ms)
}

// ---------- send path ----------

export function sendHello(hello: HelloMsg): void {
  helloMsg = hello
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(hello))
}

export function sendStats(stats: ClientMsg): void {
  statsMsg = stats
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(stats))
}

export function sendPose(pos: THREE.Vector3, quat: THREE.Quaternion, speedKmh: number): void {
  if (ws?.readyState !== WebSocket.OPEN) return
  encodePose(_sendBuf, pos.x, pos.y, pos.z, quat.x, quat.y, quat.z, quat.w, speedKmh)
  ws.send(_sendBuf)
}

export function sendPropPop(f: number, i: number, vx: number, vz: number, speed: number): void {
  if (ws?.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ t: 'prop', round: propsSignal.round, f, i, vx, vz, speed }))
}

// keep POSE_BYTES exported-through for the relay's sanity check
export { POSE_BYTES }
