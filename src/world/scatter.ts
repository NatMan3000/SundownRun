import { mulberry32, fbm2D } from '../core/random'
import {
  PLAYGROUNDS,
  ROAD_DENSE,
  ROAD_RIBBON_HALF,
  getTerrainHeight,
  playgroundWear,
  rimHeightAt,
  rimMinCrestRadius,
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
  /**
   * Bouncy-mode dome (CONFIG.bouncyRocks). A ball the width of the rock's girth, buried
   * so its crown meets the visible boulder top and its centre sits BELOW ground. Contact
   * with the car happens on the upper hemisphere, so the surface normal tilts up: a
   * glancing hit rides up the curve and launches, a square hit still costs speed. Paired
   * with low friction + high restitution in Colliders.tsx - geometry, not an impulse hack.
   */
  bounceR: number
  bounceY: number
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
const TARGET_ROCKS = 420 // was 640 - thinned on Nathan's playtest call, they crowded the open world
/** Loose stone climbing the rim's lower slopes. Decoration only, no colliders out there. */
const TARGET_SCREE = 620
const GRASS_COUNT = 32000
/** Tufts sown across the four playground landforms so their ramps read as drivable ground. */
const PLAYGROUND_GRASS = 3600

/**
 * Trees climb the foothills and give out as the slope steepens - a treeline, not a
 * fence. A tree behind the boundary would be scenery the player can see but never
 * touch, which is exactly the inconsistency constitution s5 forbids; the rim's own
 * height does the culling for us, because nothing grows above 85 m of rim.
 */
const TREELINE_RIM_HEIGHT = 85

/**
 * Rocks smaller than this are kerb-height decoration and stay colliderless; anything
 * you could actually trip the car on gets a ball. `sy` is the vertical radius, and a
 * rock is sunk 32% of it, so this is roughly a 30 cm stone.
 */
const ROCK_COLLIDER_MIN_SY = 0.42
/** Scree scatters onto the rock face for texture, but nothing behind the wall collides. */
const colliderMaxRadius = () => rimMinCrestRadius() - 20

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
    if (playgroundWear(p.x, p.z) > 0.1) continue // a jump face is not a place for a tree
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
  // NO target cap here, and that is deliberate. Capping it made the loop stop once the
  // species quotas filled, and because it scans x ascending, every background tree in
  // the world ended up on the western half of the map - the eastern foothills came out
  // completely bare. Density alone decides the count now.
  const STEP = 30
  for (let gx = -960; gx <= 960; gx += STEP) {
    for (let gz = -960; gz <= 960; gz += STEP) {
      const x = gx + (rng() - 0.5) * STEP * 0.95
      const z = gz + (rng() - 0.5) * STEP * 0.95
      // Never grow a tree the boundary would leave unreachable: it would render but
      // carry no collider, which is the ghost tree s5 forbids.
      if (Math.hypot(x, z) > colliderMaxRadius()) continue
      // the corridor pass owns everything within 150 m
      if (roadDistance(x, z, 150) !== Infinity) continue
      // A treeline, not a fence: clusters climb the foothills and thin out as the rim
      // rises under them, so the lower slopes read as living ground and the rock face
      // above reads as rock.
      let density = groveDensity(x, z) * 0.8
      density *= 1 - smoothstep(20, TREELINE_RIM_HEIGHT, rimHeightAt(x, z))
      if (rng() > density) continue
      if (slopeAt(x, z) > 0.8) continue
      if (playgroundWear(x, z) > 0.08) continue // leave the landforms clear to ride
      const roll = rng()
      const species = roll < 0.44 ? 0 : roll < 0.9 ? 1 : 2
      const t: TreeInstance = {
        x,
        y: getTerrainHeight(x, z),
        z,
        rotY: rng() * Math.PI * 2,
        scale: 0.75 + rng() * 0.8,
        tint: rng(),
        edge: Infinity,
      }
      if (species === 0) treesA.push(t)
      else if (species === 1) treesB.push(t)
      else treesC.push(t)
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

  // ---------- scree on the rim ----------
  // Loose stone gathering on the rock face and spilling down the gullies. This is what
  // stops the rim reading as one poured surface: a broken texture that scales with the
  // slope under it.
  for (let attempt = 0; attempt < 40000 && rocks.length < TARGET_ROCKS + TARGET_SCREE; attempt++) {
    const th = rng() * Math.PI * 2
    const r = 560 + rng() * 400
    const x = Math.cos(th) * r
    const z = Math.sin(th) * r
    const rim = rimHeightAt(x, z)
    if (rim < 4) continue
    const sl = slopeAt(x, z)
    if (rng() > 0.14 + sl * 0.9) continue
    const s = 0.4 + Math.pow(rng(), 2.4) * 3.4
    rocks.push({
      x,
      y: getTerrainHeight(x, z),
      z,
      rotY: rng() * Math.PI * 2,
      tilt: (rng() - 0.5) * 0.7,
      sx: s * (0.8 + rng() * 0.5),
      sy: s * (0.5 + rng() * 0.5),
      sz: s * (0.8 + rng() * 0.5),
      shade: rng(),
      edge: Infinity,
    })
  }

  // ---------- a sparse ring of stones around each playground ----------
  // The "something is over there" hint, readable from the road long before the shape of
  // the landform itself is.
  for (const pg of PLAYGROUNDS) {
    for (let i = 0; i < 16; i++) {
      const th = rng() * Math.PI * 2
      const r = pg.reach * (0.45 + rng() * 0.3)
      const x = pg.x + Math.cos(th) * r
      const z = pg.z + Math.sin(th) * r
      if (roadDistance(x, z, 30) !== Infinity) continue
      const s = 0.6 + Math.pow(rng(), 1.6) * 1.8
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
  }

  // ---------- grass ----------
  const grass = new Float32Array((GRASS_COUNT + PLAYGROUND_GRASS) * 6)
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

  // Tufts over the landforms. They thin out where the ground is worn to dirt, which is
  // what makes a ramp read as a ramp you can ride rather than a lump of geometry.
  const perPlayground = Math.floor(PLAYGROUND_GRASS / PLAYGROUNDS.length)
  for (const pg of PLAYGROUNDS) {
    let placed = 0
    for (let attempt = 0; attempt < perPlayground * 4 && placed < perPlayground; attempt++) {
      const th = rng() * Math.PI * 2
      const r = pg.reach * 0.8 * Math.sqrt(rng())
      const x = pg.x + Math.cos(th) * r
      const z = pg.z + Math.sin(th) * r
      if (roadDistance(x, z, 26) !== Infinity) continue
      if (rng() < playgroundWear(x, z) * 0.85) continue // bare where the tyres go
      const o = grassCount * 6
      grass[o] = x
      grass[o + 1] = getTerrainHeight(x, z)
      grass[o + 2] = z
      grass[o + 3] = rng() * Math.PI
      grass[o + 4] = 0.55 + rng() * 0.6
      grass[o + 5] = rng()
      grassCount++
      placed++
    }
  }

  // ---------- rock colliders ----------
  // Consistency rule: if a rock is big enough to look solid, it IS solid - everywhere
  // in the bowl, not just beside the road. Kerb-height pebbles stay decoration.
  const rockColliders: RockCollider[] = []
  const maxR = colliderMaxRadius()
  for (const r of rocks) {
    if (r.sy < ROCK_COLLIDER_MIN_SY) continue
    if (Math.hypot(r.x, r.z) > maxR) continue
    const hr = Math.min(r.sx, r.sz) //           the rock's horizontal half-extent
    const ballY = r.y - r.sy * 0.32 + hr * 0.2 // today's sunk ball, unchanged
    const ballR = hr * 0.85
    // Bouncy dome: girth-wide, crown at the visible top, centre dropped at least 0.3 m
    // under the ground so the exposed cap reads as a ride-up ramp from every angle.
    const vtop = r.y + r.sy * 0.68 //            approx crown of the visible boulder
    const bounceR = hr
    let bounceY = vtop - bounceR
    const maxCenter = r.y - 0.3
    if (bounceY > maxCenter) bounceY = maxCenter
    rockColliders.push({ x: r.x, y: ballY, z: r.z, r: ballR, bounceR, bounceY })
  }

  cache = { treesA, treesB, treesC, rocks, grass, grassCount, rockColliders }
  return cache
}

/** Every tree is inside the boundary, so every tree is reachable. Used by treeSmash. */
export function treeIsReachable(t: TreeInstance): boolean {
  return Math.hypot(t.x, t.z) <= colliderMaxRadius()
}
