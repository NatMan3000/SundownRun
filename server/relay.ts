// ============================================================
//  MULTIPLAYER RELAY - a dumb, fast fan-out. Run with Bun.
// ------------------------------------------------------------
//  No rooms, no auth, no game logic: every message a client sends is
//  forwarded to every other client. Binary pose packets get a 4-byte
//  sender-id prefix; JSON control messages get a `from` field. The
//  relay remembers each client's latest `hello` so a late joiner
//  learns who is already driving.
//
//  Runs standalone (`bun run relay`) or embedded by server/mp.ts.
//  NOTE: outside tsconfig's include - Bun executes it directly; keep
//  Bun-specific typing loose so the editor stays quiet without
//  @types/bun in the project.
// ============================================================

import { POSE_BYTES, RELAY_PORT } from '../src/net/protocol'
import type { HelloMsg } from '../src/net/protocol'

interface ClientState {
  id: number
  hello: HelloMsg | null
}

export function startRelay(port = RELAY_PORT) {
  let nextId = 1
  // ws handles keyed by client id - Bun's ServerWebSocket carries our state in .data
  const clients = new Map<number, { ws: any; state: ClientState }>()

  const broadcast = (except: number, payload: string | Uint8Array) => {
    for (const [id, c] of clients) {
      if (id !== except) c.ws.send(payload)
    }
  }

  const server = Bun.serve<ClientState, {}>({
    port,
    fetch(req, srv) {
      if (
        srv.upgrade(req, { data: { id: nextId++, hello: null } satisfies ClientState })
      ) {
        return undefined
      }
      return new Response('Sundown Run relay - connect via WebSocket.\n', { status: 200 })
    },
    websocket: {
      // A tab that reloads or crashes can leave a half-open TCP socket - a
      // "zombie" player parked in everyone's roster until the OS gives up.
      // Live clients stream poses constantly, so 30s of silence means gone.
      idleTimeout: 30,
      open(ws) {
        const { id } = ws.data
        // Introduce the room to the newcomer...
        ws.send(
          JSON.stringify({
            t: 'welcome',
            id,
            peers: [...clients.values()].map((c) => ({ id: c.state.id, hello: c.state.hello })),
          })
        )
        clients.set(id, { ws, state: ws.data })
        // ...and the newcomer to the room.
        broadcast(id, JSON.stringify({ t: 'join', id }))
        console.log(`[relay] player ${id} connected (${clients.size} online)`)
      },
      message(ws, message) {
        const { id } = ws.data
        if (typeof message !== 'string') {
          // pose packet: tag with sender id, fan out
          const bytes = message as Uint8Array
          if (bytes.byteLength !== POSE_BYTES) return
          const tagged = new Uint8Array(4 + POSE_BYTES)
          new DataView(tagged.buffer).setUint32(0, id, true)
          tagged.set(bytes, 4)
          broadcast(id, tagged)
          return
        }
        // control message: parse just enough to cache hellos, then forward
        let msg: any
        try {
          msg = JSON.parse(message)
        } catch {
          return
        }
        if (msg?.t === 'hello') {
          ws.data.hello = msg
          console.log(`[relay] player ${id} is "${msg.name}" (${msg.body}, ${msg.color})`)
        }
        msg.from = id
        broadcast(id, JSON.stringify(msg))
      },
      close(ws) {
        const { id } = ws.data
        clients.delete(id)
        broadcast(id, JSON.stringify({ t: 'leave', id }))
        console.log(`[relay] player ${id} left (${clients.size} online)`)
      },
    },
  })

  console.log(`[relay] listening on ws://0.0.0.0:${server.port}`)
  return server
}

if (import.meta.main) startRelay()
