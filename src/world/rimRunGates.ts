// ============================================================
//  RIM-RUN GATES - threading the gate at the top of a big-air run scores
// ------------------------------------------------------------
//  Each big-air run has one timber gate at the top of its descent, on the
//  turnaround pad. Thread it heading down the chute and you bank points before
//  the launch even arrives - so a clean run reads entrance-to-launch (the ask).
//
//  Same per-step posture as archGates.ts - one translation() read, a few scalar
//  ops per gate, zero allocation, a short cooldown to kill contact jitter. The
//  ONE difference from archGates is the frame: here it is derived cleanly from
//  the run's own radial (the thread direction, down the chute) and tangential
//  (the gap) axes in core/terrain.ts, so posts and scoring share one geometry.
// ============================================================

import type { RapierRigidBody } from '@react-three/rapier'
import { CONFIG } from '../core/config'
import { getAirRuns, getTerrainHeight } from '../core/terrain'
import { emitTrick } from '../core/tricks'
import type { BodyQuery } from './treeSmash'

const GATE_PTS = 50
/** Steps (60Hz) a gate stays quiet after a thread. */
const COOLDOWN_STEPS = 120
/** How far down the chute (toward the launch) the gate sits from the pad centre. */
export const GATE_BACK = 6
/** Half the drivable opening between the posts, metres. */
export const GATE_HALF_GAP = 5
/** Above this height over the pad it is a fly-over, not a thread. Posts are 4.6 m. */
const MAX_CLEAR_Y = 4.0

export interface RimRunGate {
  /** gate-plane centre (on the pad, a little down the chute) */
  x: number
  z: number
  /** thread axis = the chute's radial. The gate plane is perpendicular to this. */
  rdx: number
  rdz: number
  /** gap axis = the chute's tangential */
  tdx: number
  tdz: number
  halfGap: number
  groundY: number
  name: string
}

let gatesCache: RimRunGate[] | null = null

export function getRimRunGates(): RimRunGate[] {
  if (gatesCache) return gatesCache
  const out: RimRunGate[] = []
  for (const run of getAirRuns()) {
    const x = run.padx - run.rdx * GATE_BACK
    const z = run.padz - run.rdz * GATE_BACK
    out.push({
      x,
      z,
      rdx: run.rdx,
      rdz: run.rdz,
      tdx: run.tdx,
      tdz: run.tdz,
      halfGap: GATE_HALF_GAP,
      groundY: getTerrainHeight(x, z),
      name: run.name,
    })
  }
  gatesCache = out
  return out
}

// Per-gate state. along = signed distance from the gate plane last step.
let lastAlong: Float64Array | null = null
let cooldown: Int32Array | null = null
let car: RapierRigidBody | null = null

function findCar(world: BodyQuery): RapierRigidBody | null {
  let found: RapierRigidBody | null = null
  world.forEachRigidBody((b) => {
    if (!found && b.isDynamic() && b.mass() > 200) found = b
  })
  return found
}

/** Fresh <Physics> mount (HMR, StrictMode) - forget the body and crossing state. */
export function resetRimRunGates(): void {
  car = null
  const n = getRimRunGates().length
  lastAlong = new Float64Array(n).fill(NaN)
  cooldown = new Int32Array(n)
}

export function stepRimRunGates(world: BodyQuery): void {
  if (!CONFIG.tricks) return
  const gates = getRimRunGates()
  if (!lastAlong || !cooldown) resetRimRunGates()
  const la = lastAlong!
  const cd = cooldown!
  if (!car) {
    car = findCar(world)
    if (!car) return
  }
  const p = car.translation()

  for (let i = 0; i < gates.length; i++) {
    if (cd[i] > 0) {
      cd[i]--
      continue
    }
    const g = gates[i]
    const dx = p.x - g.x
    const dz = p.z - g.z
    // along = distance across the gate plane (thread direction = the chute radial)
    const along = dx * g.rdx + dz * g.rdz
    const prev = la[i]
    la[i] = along

    if (Number.isNaN(prev) || (prev < 0) === (along < 0)) continue // plane not crossed
    if (Math.abs(prev) > 6 || Math.abs(along) > 6) continue //         a teleport, not a pass

    const across = dx * g.tdx + dz * g.tdz
    if (Math.abs(across) > g.halfGap) continue //                      clipped wide of a post
    if (p.y - g.groundY > MAX_CLEAR_Y) continue //                     sailed over the beam

    emitTrick('GATE', GATE_PTS, 1)
    cd[i] = COOLDOWN_STEPS
  }
}
