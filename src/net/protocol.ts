// ============================================================
//  MULTIPLAYER PROTOCOL - the wire format, shared by both ends
// ------------------------------------------------------------
//  Two kinds of traffic over one WebSocket:
//
//  BINARY - pose packets, the 60Hz firehose. A client sends a bare
//    32-byte Float32Array [px,py,pz, qx,qy,qz,qw, speedKmh]; the relay
//    prepends a 4-byte little-endian uint32 sender id and fans it out
//    to everyone else. No timestamps cross the wire - clocks on two
//    machines never agree, so the receiver stamps arrival time locally
//    and interpolates against that (see net.ts).
//
//  JSON - everything low-frequency: hello (who am I, what car), stats
//    (lap times, trick score), and the relay's own welcome/join/leave.
//    The relay stamps a `from` id onto forwarded client messages.
//
//  server/relay.ts imports this file too - keep it dependency-free.
// ============================================================

export const RELAY_PORT = 5200

/** px,py,pz, qx,qy,qz,qw, speedKmh */
export const POSE_FLOATS = 8
export const POSE_BYTES = POSE_FLOATS * 4
/** relay -> client: uint32 id + pose */
export const TAGGED_POSE_BYTES = 4 + POSE_BYTES

// Car body ids, mirrored from core/store to keep this file importable by the
// Bun-side relay without dragging zustand along.
export type NetCarBody = 'coupe' | 'striker' | 'muscle' | 'wedge'

export interface HelloMsg {
  t: 'hello'
  name: string
  body: NetCarBody
  color: string
}

export interface StatsMsg {
  t: 'stats'
  lastLapMs: number | null
  bestLapMs: number | null
  trickScore: number
}

/** Someone pressed the race button: everyone lines up and counts down.
 *  `round` deals a fresh shared crash-prop layout for the race. */
export interface RaceMsg {
  t: 'race'
  raceId: number
  round: number
}

/** "I crossed the line" - the first one of these per raceId wins. */
export interface RaceWinMsg {
  t: 'raceWin'
  raceId: number
  ms: number
}

/** A crash-prop cluster burst on the sender's machine. */
export interface PropMsg {
  t: 'prop'
  round: number
  f: number
  i: number
  vx: number
  vz: number
  speed: number
}

/** Sent by the relay to a client the moment it connects. */
export interface WelcomeMsg {
  t: 'welcome'
  id: number
  /** Everyone already in - hello is null until that peer introduces itself. */
  peers: { id: number; hello: HelloMsg | null }[]
}

export interface JoinMsg {
  t: 'join'
  id: number
}

export interface LeaveMsg {
  t: 'leave'
  id: number
}

export type ClientMsg = HelloMsg | StatsMsg | RaceMsg | RaceWinMsg | PropMsg
export type RelayMsg = WelcomeMsg | JoinMsg | LeaveMsg | (ClientMsg & { from: number })

export function encodePose(
  out: Float32Array,
  px: number,
  py: number,
  pz: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  speedKmh: number
): Float32Array {
  out[0] = px
  out[1] = py
  out[2] = pz
  out[3] = qx
  out[4] = qy
  out[5] = qz
  out[6] = qw
  out[7] = speedKmh
  return out
}
