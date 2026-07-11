// ============================================================
//  ARCH GATES - threading a ridge arch is worth points
// ------------------------------------------------------------
//  The three RidgeArches are solid posts with a gap that IS the target
//  (RidgeArches.tsx). This watches the car's motion each physics step and
//  scores a clean thread: crossing the gate's plane inside the gap, under
//  the beam, in either direction. Same per-step posture as treeSmash - one
//  translation() read, a few scalar ops per arch, zero allocation. A short
//  per-arch cooldown stops contact jitter double-counting one pass.
// ============================================================

import type { RapierRigidBody } from '@react-three/rapier'
import { CONFIG } from '../core/config'
import { getTerrainHeight } from '../core/terrain'
import { emitTrick } from '../core/tricks'
import { RIDGE_ARCHES } from './RidgeArches'
import type { BodyQuery } from './treeSmash'

const GATE_PTS = 40
/** Steps (60Hz) an arch stays quiet after a thread - kills contact jitter repeats. */
const COOLDOWN_STEPS = 120
/** Above the beam is a fly-over, not a thread. Posts are 4.6 m, beam drops 0.25. */
const MAX_CLEAR_Y = 4.0

// Per-arch state, sized once. along = signed distance from the gate plane last step.
const lastAlong = new Float64Array(RIDGE_ARCHES.length).fill(NaN)
const cooldown = new Int32Array(RIDGE_ARCHES.length)
const groundY = RIDGE_ARCHES.map((a) => getTerrainHeight(a.x, a.z))

let car: RapierRigidBody | null = null

function findCar(world: BodyQuery): RapierRigidBody | null {
  let found: RapierRigidBody | null = null
  world.forEachRigidBody((b) => {
    if (!found && b.isDynamic() && b.mass() > 200) found = b
  })
  return found
}

/** Fresh <Physics> mount (HMR, StrictMode) - forget the body and the crossing state. */
export function resetArchGates(): void {
  car = null
  lastAlong.fill(NaN)
  cooldown.fill(0)
}

export function stepArchGates(world: BodyQuery): void {
  if (!CONFIG.tricks) return
  if (!car) {
    car = findCar(world)
    if (!car) return
  }
  const p = car.translation()

  for (let i = 0; i < RIDGE_ARCHES.length; i++) {
    if (cooldown[i] > 0) {
      cooldown[i]--
      continue
    }
    const a = RIDGE_ARCHES[i]
    const dx = p.x - a.x
    const dz = p.z - a.z
    // Gate frame: along = travel direction (heading), across = left normal.
    const along = dx * Math.sin(a.heading) + dz * Math.cos(a.heading)
    const prev = lastAlong[i]
    lastAlong[i] = along

    // Only look closely when the plane was actually crossed between two steps.
    if (Number.isNaN(prev) || (prev < 0) === (along < 0)) continue
    // A teleport/reset can flip the sign from across the map - a real pass is near.
    if (Math.abs(prev) > 6 || Math.abs(along) > 6) continue

    const across = -dx * Math.cos(a.heading) + dz * Math.sin(a.heading)
    if (Math.abs(across) > a.halfGap) continue // clipped wide of the posts
    if (p.y - groundY[i] > MAX_CLEAR_Y) continue // sailed over the beam

    emitTrick('GATE', GATE_PTS, 1)
    cooldown[i] = COOLDOWN_STEPS
  }
}
