import * as THREE from 'three'
import type { RapierCollider, RapierRigidBody } from '@react-three/rapier'
import { CONFIG } from '../core/config'
import { WORLD_SIZE } from '../core/terrain'
import { telemetry } from '../core/telemetry'
import * as audio from '../audio/AudioEngine'
import { emitTrick } from '../core/tricks'
import { getScatter, treeIsReachable, type TreeInstance } from './scatter'

// ============================================================
// TREES YOU CAN HIT (constitution, section 5)
//
// Every reachable tree carries a static trunk collider, so a tree is never a ghost.
// What happens when you hit one depends only on how fast you were going:
//
//   under the knob : nothing special. rapier resolves a solid collision, the car
//                    stops or slews, and the drive worker's dv detector raises
//                    telemetry.impact all by itself. No code runs here at all.
//
//   over the knob  : the trunk gives way. We disable its collider in the physics
//                    step's BEFORE hook - the frame the car is about to reach it -
//                    so no contact impulse is ever solved and the car cannot be
//                    bricked at 190 km/h. In its place we apply a modest impulse
//                    (a couple of m/s of speed, felt but never fatal), raise
//                    telemetry.impact for the camera kick, thump the audio, and
//                    hand the instance to the animator to be flung and toppled.
//
// "the knob" is CONFIG.treeSmashKmh - a kid can set it to 5 and mow the forest, or to
// 300 and never break a branch.
//
// The look-ahead is what makes this safe: at 53 m/s a physics step moves the car
// 0.88 m, so we test the chassis box swept forward by one step. A tree is disarmed
// while the bumper is still ~0.9 m short of it - imperceptible at that speed, and
// impossible to skip.
//
// Everything below runs allocation-free: module temps, a CSR grid, a swap-remove
// active list.
// ============================================================

/** Below this the trunk holds. Kid knob: CONFIG.treeSmashKmh (default 40). */
const SMASH_SPEED = CONFIG.treeSmashKmh / 3.6

// The chassis box, mirrored from vehicle/tuning.ts CHASSIS. Read-only here: the world
// worker does not own that file, and a wrong number only softens the look-ahead.
const CAR_HALF_W = 0.88
const CAR_HALF_L = 2.0
const CAR_BOTTOM = -0.34 //  body origin -> underside, with a little slack
const CAR_TOP = 0.56

const STEP_DT = 1 / 60 //    Physics timeStep in App.tsx
const LOOK_AHEAD = 1.7 //    steps of travel to disarm in advance
const MAX_SMASH_PER_STEP = 2

// Trunk dimensions per species, matched to geometry.ts. The radius is padded ~0.1 m so
// a clipped tree feels like a hit rather than a miss.
const TRUNK = [
  { h: 3.4, r: 0.4 }, //  0 broadleaf
  { h: 5.4, r: 0.34 }, // 1 slim
  { h: 2.9, r: 0.39 }, // 2 autumn
] as const
const MAX_TRUNK_R = 0.4 * 1.55 // largest radius after the largest instance scale

/**
 * The slice of rapier's World this module needs. Structural, so we never import from
 * @dimforge/rapier3d-compat - which is a transitive dependency, not one of ours.
 */
export interface BodyQuery {
  forEachRigidBody(f: (body: RapierRigidBody) => void): void
}

// ---------- the registry ----------

export interface TreeBody {
  species: 0 | 1 | 2
  index: number //   instance index inside that species' InstancedMesh
  x: number
  y: number
  z: number
  rotY: number
  scale: number
  trunkR: number
  trunkH: number
  collider: RapierCollider | null

  /** 0 standing, 1 smashed and animating, 2 gone. */
  state: 0 | 1 | 2
  t: number //       seconds since the smash
  px: number //      animated pose
  py: number
  pz: number
  vx: number
  vy: number
  vz: number
  axisX: number //   horizontal topple axis
  axisZ: number
  spin: number
  angle: number
  groundY: number
}

let bodies: TreeBody[] | null = null

function build(list: TreeInstance[], species: 0 | 1 | 2, out: TreeBody[]): void {
  const trunk = TRUNK[species]
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    if (!treeIsReachable(t)) continue
    out.push({
      species,
      index: i,
      x: t.x,
      y: t.y,
      z: t.z,
      rotY: t.rotY,
      scale: t.scale,
      trunkR: trunk.r * t.scale,
      trunkH: trunk.h * t.scale,
      collider: null,
      state: 0,
      t: 0,
      px: t.x,
      py: t.y,
      pz: t.z,
      vx: 0,
      vy: 0,
      vz: 0,
      axisX: 1,
      axisZ: 0,
      spin: 0,
      angle: 0,
      groundY: t.y,
    })
  }
}

export function getTreeBodies(): TreeBody[] {
  if (bodies) return bodies
  const s = getScatter()
  const out: TreeBody[] = []
  build(s.treesA, 0, out)
  build(s.treesB, 1, out)
  build(s.treesC, 2, out)
  bodies = out
  return out
}

// ---------- broadphase grid ----------

const CELL = 16
const GN = Math.ceil(WORLD_SIZE / CELL)
let gridStart: Int32Array | null = null
let gridItems: Int32Array | null = null

function cellIndex(v: number): number {
  const i = Math.floor((v + WORLD_SIZE / 2) / CELL)
  return i < 0 ? 0 : i >= GN ? GN - 1 : i
}

function buildGrid(): void {
  const list = getTreeBodies()
  const counts = new Int32Array(GN * GN)
  for (const t of list) counts[cellIndex(t.x) + cellIndex(t.z) * GN]++
  const start = new Int32Array(GN * GN + 1)
  let acc = 0
  for (let c = 0; c < GN * GN; c++) {
    start[c] = acc
    acc += counts[c]
  }
  start[GN * GN] = acc
  const cursor = start.slice(0, GN * GN)
  const items = new Int32Array(list.length)
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    items[cursor[cellIndex(t.x) + cellIndex(t.z) * GN]++] = i
  }
  gridStart = start
  gridItems = items
}

// ---------- module temps: nothing here allocates per step ----------

const _q = new THREE.Quaternion()
const _fwd = new THREE.Vector3()
const _rgt = new THREE.Vector3()
const _impulse = { x: 0, y: 0, z: 0 }

const active: TreeBody[] = []
let car: RapierRigidBody | null = null

function findCar(world: BodyQuery): RapierRigidBody | null {
  let found: RapierRigidBody | null = null
  // Exactly one dynamic body exists: the chassis. Guard on mass anyway, so a future
  // dynamic prop cannot steal the wheel.
  world.forEachRigidBody((b) => {
    if (!found && b.isDynamic() && b.mass() > 200) found = b
  })
  return found
}

/** Wipe the smash state so a fresh <Physics> mount (HMR, StrictMode) starts standing. */
export function resetTreeSmash(): void {
  car = null
  active.length = 0
  const list = getTreeBodies()
  for (const t of list) {
    t.state = 0
    t.t = 0
    t.angle = 0
    t.spin = 0
    t.px = t.x
    t.py = t.y
    t.pz = t.z
    t.collider = null
  }
}

// ---------- the sweep, run before every physics step ----------

function smash(
  t: TreeBody,
  carX: number,
  carZ: number,
  vx: number,
  vz: number,
  speed: number,
  body: RapierRigidBody
): void {
  t.collider?.setEnabled(false)
  t.collider = null
  t.state = 1
  t.t = 0
  // A felled tree is worth a couple of points - mowing a grove adds up.
  if (CONFIG.tricks) emitTrick('TIMBER', 2, 1)
  t.px = t.x
  t.py = t.y
  t.pz = t.z

  // Fling along the car's motion, biased away from whichever side it clipped.
  const ox = t.x - carX
  const oz = t.z - carZ
  const ol = Math.hypot(ox, oz) || 1
  let dx = (vx / speed) * 0.78 + (ox / ol) * 0.55
  let dz = (vz / speed) * 0.78 + (oz / ol) * 0.55
  const dl = Math.hypot(dx, dz) || 1
  dx /= dl
  dz /= dl

  const launch = 5.5 + speed * 0.2
  t.vx = dx * launch
  t.vz = dz * launch
  t.vy = 3.4 + speed * 0.055
  // topple about the horizontal axis square to the fling: it goes over forwards
  t.axisX = -dz
  t.axisZ = dx
  t.spin = 3.2 + speed * 0.07
  t.angle = 0
  active.push(t)

  const intensity = Math.min(1, Math.max(0, (speed - SMASH_SPEED) / 22))

  // The camera kick and the audio thump both read telemetry.impact, and the drive
  // worker's own dv detector only ever raises it - so writing it here composes.
  const hit = 0.32 + 0.45 * intensity
  if (hit > telemetry.impact) telemetry.impact = hit
  audio.playLanding(0.35 + 0.5 * intensity)

  // A tree costs you a couple of m/s. Felt, never fatal.
  const dv = 0.8 + 0.9 * t.scale
  const m = body.mass()
  _impulse.x = (-vx / speed) * dv * m
  _impulse.y = 0
  _impulse.z = (-vz / speed) * dv * m
  body.applyImpulse(_impulse, true)
}

export function stepTreeSmash(world: BodyQuery): void {
  if (!gridStart) buildGrid()
  if (!car) {
    car = findCar(world)
    if (!car) return
  }
  const body = car
  // rapier's compat getters mint a small object per call (the vehicle hook lives with
  // the same tax). Call each one at most ONCE per step, and bail before the other two
  // whenever the car is too slow to smash anything.
  const v = body.linvel()
  const speed = Math.hypot(v.x, v.z)
  if (speed < SMASH_SPEED) return // slow hits stay solid - rapier does all the work

  const p = body.translation()
  const r = body.rotation()
  _q.set(r.x, r.y, r.z, r.w)
  _fwd.set(0, 0, 1).applyQuaternion(_q)
  _rgt.set(1, 0, 0).applyQuaternion(_q)
  _fwd.y = 0
  _rgt.y = 0
  if (_fwd.lengthSq() < 1e-6 || _rgt.lengthSq() < 1e-6) return // car is on its nose
  _fwd.normalize()
  _rgt.normalize()

  // The chassis box, swept one step along its own velocity.
  const lvx = v.x * _rgt.x + v.z * _rgt.z
  const lvz = v.x * _fwd.x + v.z * _fwd.z
  const carBottom = p.y + CAR_BOTTOM
  const carTop = p.y + CAR_TOP

  const reach = CAR_HALF_L + MAX_TRUNK_R + speed * STEP_DT * LOOK_AHEAD + 1
  const cx = cellIndex(p.x)
  const cz = cellIndex(p.z)
  const rings = Math.ceil(reach / CELL)
  const x0 = Math.max(0, cx - rings)
  const x1 = Math.min(GN - 1, cx + rings)
  const z0 = Math.max(0, cz - rings)
  const z1 = Math.min(GN - 1, cz + rings)

  const list = getTreeBodies()
  const start = gridStart!
  const items = gridItems!
  let hits = 0

  for (let gz = z0; gz <= z1 && hits < MAX_SMASH_PER_STEP; gz++) {
    const row = gz * GN
    for (let gx = x0; gx <= x1 && hits < MAX_SMASH_PER_STEP; gx++) {
      const c = gx + row
      for (let k = start[c], e = start[c + 1]; k < e; k++) {
        const t = list[items[k]]
        if (t.state !== 0) continue
        if (carBottom > t.y + t.trunkH || carTop < t.y + 0.1) continue // flying over it

        const dx = t.x - p.x
        const dz = t.z - p.z
        const lx = dx * _rgt.x + dz * _rgt.z
        const lz = dx * _fwd.x + dz * _fwd.z
        const ex = CAR_HALF_W + t.trunkR + Math.abs(lvx) * STEP_DT * LOOK_AHEAD + 0.12
        const ez = CAR_HALF_L + t.trunkR + Math.abs(lvz) * STEP_DT * LOOK_AHEAD + 0.12
        if (lx < -ex || lx > ex || lz < -ez || lz > ez) continue

        smash(t, p.x, p.z, v.x, v.z, speed, body)
        if (++hits >= MAX_SMASH_PER_STEP) break
      }
    }
  }
}

// ---------- animation, advanced once per rendered frame ----------

const GRAVITY = 15 //        exaggerated: a felled tree should land, not hang
const SETTLE_ANGLE = 1.85 // just past horizontal, so it lies down
const FADE_START = 3.0
const FADE_SECONDS = 1.1

let lastElapsed = -1
/** Set when a species' instance matrices need re-uploading this frame. */
const dirty = [false, false, false]

/**
 * Idempotent per frame: the three Species components all call this, the first one
 * through does the work. Returns whether `species` has instances to rewrite.
 */
export function advanceTreeSmash(elapsed: number, species: 0 | 1 | 2): boolean {
  if (elapsed !== lastElapsed) {
    const dt = lastElapsed < 0 ? 0 : Math.min(0.05, elapsed - lastElapsed)
    lastElapsed = elapsed
    dirty[0] = false
    dirty[1] = false
    dirty[2] = false

    for (let i = active.length - 1; i >= 0; i--) {
      const t = active[i]

      // Retire a frame LATE, on purpose. A tree that finished fading last frame has
      // already had its zero-scale matrix written and uploaded; drop it now. Popping
      // it the moment it expires would strand it at its last visible size.
      if (t.state === 2) {
        active[i] = active[active.length - 1]
        active.pop()
        continue
      }

      t.t += dt
      dirty[t.species] = true

      if (t.angle < SETTLE_ANGLE) {
        t.px += t.vx * dt
        t.py += t.vy * dt
        t.pz += t.vz * dt
        t.vy -= GRAVITY * dt
        t.angle += t.spin * dt
        if (t.py <= t.groundY) {
          t.py = t.groundY
          t.vx *= 0.3
          t.vz *= 0.3
          t.vy = -t.vy * 0.18
          t.spin *= 0.35
          if (Math.abs(t.vy) < 0.6) {
            t.vy = 0
            t.vx = 0
            t.vz = 0
          }
        }
        if (t.angle >= SETTLE_ANGLE) {
          t.angle = SETTLE_ANGLE
          t.spin = 0
        }
      }

      // Faded out: mark gone. smashScale() now returns 0, this frame writes the
      // collapsed matrix, and the block at the top of the next frame drops it.
      if (t.t > FADE_START + FADE_SECONDS) t.state = 2
    }
  }
  return dirty[species]
}

/** Scale of a smashed tree this frame - it sinks away rather than blinking out. */
export function smashScale(t: TreeBody): number {
  if (t.t <= FADE_START) return t.scale
  const k = 1 - (t.t - FADE_START) / FADE_SECONDS
  return t.scale * Math.max(0, k)
}

/** Trees currently mid-smash, plus any that finished this frame and need zeroing. */
export function activeSmashed(): readonly TreeBody[] {
  return active
}
