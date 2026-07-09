import { mulberry32, fbm2D } from '../core/random'
import {
  BOUNDARY_RADIUS,
  ROAD_DENSE,
  ROAD_RIBBON_HALF,
  RIM_FACE,
  getTerrainHeight,
  roadDistance,
  roadEdgeDistance,
} from '../core/terrain'

// ============================================================
// Every blade of grass, every tree, every rock is placed from a
// seeded PRNG. Math.random() appears nowhere: the world is bit
// for bit identical on every machine and every reload.
//
// Density is authored where the player actually looks. Vegetation
// is scattered ALONG the road (an exact lateral offset from a
// spline station) rather than rejection-sampled over 4 km^2, which
// makes the near-road band dense for free and costs no search.
// ============================================================

export interface TreeInstance {
  x: number
  y: number
  z: number
  rotY: number
  scale: number
  tint: number // 0..1, drives the per-instance colour jitter
  edge: number // metres from the road ribbon's edge
}

export interface RockInstance {
  x: number
  y: number
  z: number
  rotY: number
  tilt: number
  sx: number
  sy: number
  sz: number
  shade: number
  edge: number
}

export interface RockCollider {
  x: number
  y: number
  z: number
  r: number
}

export interface Scatter {
  treesA: TreeInstance[] // broadleaf, deep olive - the common one
  treesB: TreeInstance[] // slim upright, darker
  treesC: TreeInstance[] // autumn accent
  rocks: RockInstance[]
  grass: Float32Array // [x, y, z, rotY, scale, tint] per tuft
  grassCount: number
  rockColliders: RockCollider[]
}

const TARGET_A = 780
const TARGET_B = 620
const TARGET_C = 230
const TARGET_ROCKS = 640
const GRASS_COUNT = 32000

/**
 * Trees stop at the foot of the cliff. Nothing grows on a 71-degree face, and a tree
 * behind the boundary would be scenery the player can see but never touch - which is
 * exactly the inconsistency constitution s5 forbids. Every tree that exists is inside
 * the bowl, and every one of them gets a collider (see treeSmash.ts).
 */
const TREELINE = RIM_FACE - 4

/**
 * Rocks smaller than this are kerb-height decoration and stay colliderless; anything
 * you could actually trip the car on gets a ball. `sy` is the vertical radius, and a
 * rock is sunk 32% of it, so this is roughly a 30 cm stone.
 */
const ROCK_COLLIDER_MIN_SY = 0.42
/** Rocks scatter onto the cliff face for texture, but nothing behind the wall collides. */
const COLLIDER_MAX_RADIUS = BOUNDARY_RADIUS - 6

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Steepness of the terrain, 0 = flat, 1 = 45 degrees. */
function slopeAt(x: number, z: number): number {
  const e = 2.5
  const dx = getTerrainHeight(x + e, z) - getTerrainHeight(x - e, z)
  const dz = getTerrainHeight(x, z + e) - getTerrainHeight(x, z - e)
  return Math.hypot(dx, dz) / (2 * e)
}

/** Groves and clearings - trees clump instead of sprinkling evenly. */
function groveDensity(x: number, z: number): number {
  return smoothstep(0.4, 0.68, fbm2D(x * 0.0042 + 301.3, z * 0.0042 + 177.9, 3))
}

interface CorridorHit {
  x: number
  z: number
  edge: number
}

/**
 * A point beside the road: pick a station, step sideways.
 * `bias` > 1 crowds points toward the road. Returns null when the point landed on
 * another part of the circuit (the inside of the hairpin, the far switchback leg).
 */
function corridorPoint(
  rng: () => number,
  latMin: number,
  latMax: number,
  bias: number
): CorridorHit | null {
  const i = Math.floor(rng() * ROAD_DENSE.count)
  const half = ROAD_RIBBON_HALF + ROAD_DENSE.flare[i]
  const lo = half + latMin
  const hi = half + latMax
  const lat = lo + (hi - lo) * Math.pow(rng(), bias)
  const side = rng() < 0.5 ? -1 : 1
  const x = ROAD_DENSE.x[i] + ROAD_DENSE.tz[i] * lat * side
  const z = ROAD_DENSE.z[i] - ROAD_DENSE.tx[i] * lat * side

  const edge = roadEdgeDistance(x, z, lat + 4)
  // The nearest road may not be the station we started from. Reject anything that
  // drifted too close to any part of the ribbon.
  if (edge < latMin * 0.75) return null
  return { x, z, edge }
}

let cache: Scatter | null = null

export function getScatter(): Scatter {
  if (cache) return cache

  const rng = mulberry32(0x5eed_1a3f)

  const treesA: TreeInstance[] = []
  const treesB: TreeInstance[] = []
  const treesC: TreeInstance[] = []
  const rocks: RockInstance[] = []

  const pushTree = (t: TreeInstance, species: number) => {
    if (species === 0 && treesA.length < TARGET_A) treesA.push(t)
    else if (species === 1 && treesB.length < TARGET_B) treesB.push(t)
    else if (species === 2 && treesC.length < TARGET_C) treesC.push(t)
  }

  const treeDone = () =>
    treesA.length >= TARGET_A && treesB.length >= TARGET_B && treesC.length >= TARGET_C

  // ---------- trees beside the road (about 70%) ----------
  const corridorA = Math.round(TARGET_A * 0.7)
  const corridorB = Math.round(TARGET_B * 0.7)
  const corridorC = Math.round(TARGET_C * 0.7)
  for (let attempt = 0; attempt < 26000; attempt++) {
    if (treesA.length >= corridorA && treesB.length >= corridorB && treesC.length >= corridorC) {
      break
    }
    const p = corridorPoint(rng, 5, 142, 1.85)
    if (!p) continue
    if (slopeAt(p.x, p.z) > 0.72) continue
    if (rng() > 0.35 + 0.65 * groveDensity(p.x, p.z)) continue

    const r = rng()
    // The autumn accent is sparse, and likes the mid-distance where it reads as a
    // splash of colour rather than a wall.
    const species = r < 0.47 ? 0 : r < 0.86 ? 1 : 2
    if (species === 2 && p.edge < 14) continue
    if (species === 0 && treesA.length >= corridorA) continue
    if (species === 1 && treesB.length >= corridorB) continue
    if (species === 2 && treesC.length >= corridorC) continue

    pushTree(
      {
        x: p.x,
        y: getTerrainHeight(p.x, p.z),
        z: p.z,
        rotY: rng() * Math.PI * 2,
        scale: 0.72 + rng() * 0.72,
        tint: rng(),
        edge: p.edge,
      },
      species
    )
  }

  // ---------- background forest ----------
  const STEP = 30
  for (let gx = -960; gx <= 960 && !treeDone(); gx += STEP) {
    for (let gz = -960; gz <= 960 && !treeDone(); gz += STEP) {
      const x = gx + (rng() - 0.5) * STEP * 0.95
      const z = gz + (rng() - 0.5) * STEP * 0.95
      // the corridor pass owns everything within 150 m
      if (roadDistance(x, z, 150) !== Infinity) continue
      const r = Math.hypot(x, z)
      let density = groveDensity(x, z) * 0.8
      density *= 1 - smoothstep(TREELINE - 130, TREELINE, r) // a treeline at the cliff foot
      if (rng() > density) continue
      if (slopeAt(x, z) > 0.8) continue
      const roll = rng()
      const species = roll < 0.44 ? 0 : roll < 0.9 ? 1 : 2
      pushTree(
        {
          x,
          y: getTerrainHeight(x, z),
          z,
          rotY: rng() * Math.PI * 2,
          scale: 0.75 + rng() * 0.8,
          tint: rng(),
          edge: Infinity,
        },
        species
      )
    }
  }

  // ---------- rocks ----------
  for (let attempt = 0; attempt < 9000 && rocks.length < TARGET_ROCKS * 0.68; attempt++) {
    const p = corridorPoint(rng, 1.4, 68, 1.5)
    if (!p) continue
    const s = 0.45 + Math.pow(rng(), 2.1) * 2.3
    // nothing chunky right on the verge - it would be a wall, not a rock
    if (p.edge < 2.4 && s > 1.0) continue
    rocks.push({
      x: p.x,
      y: getTerrainHeight(p.x, p.z),
      z: p.z,
      rotY: rng() * Math.PI * 2,
      tilt: (rng() - 0.5) * 0.5,
      sx: s * (0.8 + rng() * 0.5),
      sy: s * (0.55 + rng() * 0.45),
      sz: s * (0.8 + rng() * 0.5),
      shade: rng(),
      edge: p.edge,
    })
  }
  for (let attempt = 0; attempt < 14000 && rocks.length < TARGET_ROCKS; attempt++) {
    const x = (rng() - 0.5) * 1900
    const z = (rng() - 0.5) * 1900
    if (roadDistance(x, z, 70) !== Infinity) continue
    const sl = slopeAt(x, z)
    if (rng() > 0.12 + sl * 0.9) continue // rocks gather on the steep ground
    const s = 0.5 + Math.pow(rng(), 1.9) * 3.0
    rocks.push({
      x,
      y: getTerrainHeight(x, z),
      z,
      rotY: rng() * Math.PI * 2,
      tilt: (rng() - 0.5) * 0.5,
      sx: s * (0.8 + rng() * 0.5),
      sy: s * (0.55 + rng() * 0.45),
      sz: s * (0.8 + rng() * 0.5),
      shade: rng(),
      edge: Infinity,
    })
  }

  // ---------- grass ----------
  const grass = new Float32Array(GRASS_COUNT * 6)
  let grassCount = 0
  for (let attempt = 0; attempt < GRASS_COUNT * 3 && grassCount < GRASS_COUNT; attempt++) {
    // A tight band hugging the verge, plus a wider meadow behind it.
    const near = rng() < 0.45
    const p = near ? corridorPoint(rng, 0.35, 13, 1.0) : corridorPoint(rng, 0.35, 44, 1.35)
    if (!p) continue
    const o = grassCount * 6
    grass[o] = p.x
    grass[o + 1] = getTerrainHeight(p.x, p.z)
    grass[o + 2] = p.z
    grass[o + 3] = rng() * Math.PI
    grass[o + 4] = 0.62 + rng() * 0.75
    grass[o + 5] = rng()
    grassCount++
  }

  // ---------- rock colliders ----------
  // Consistency rule: if a rock is big enough to look solid, it IS solid - everywhere
  // in the bowl, not just beside the road. Kerb-height pebbles stay decoration.
  const rockColliders: RockCollider[] = []
  for (const r of rocks) {
    if (r.sy < ROCK_COLLIDER_MIN_SY) continue
    if (Math.hypot(r.x, r.z) > COLLIDER_MAX_RADIUS) continue
    rockColliders.push({
      x: r.x,
      y: r.y - r.sy * 0.32 + Math.min(r.sx, r.sz) * 0.2,
      z: r.z,
      r: Math.min(r.sx, r.sz) * 0.85,
    })
  }

  cache = { treesA, treesB, treesC, rocks, grass, grassCount, rockColliders }
  return cache
}

/** Every tree is inside the boundary, so every tree is reachable. Used by treeSmash. */
export function treeIsReachable(t: TreeInstance): boolean {
  return Math.hypot(t.x, t.z) <= COLLIDER_MAX_RADIUS
}
