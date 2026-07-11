import * as THREE from 'three'
import { fbm2D } from './random'

// ============================================================
// WORLD SHAPE CONTRACT - single source of truth
// ------------------------------------------------------------
// Everything that needs the shape of the world reads it from
// here: terrain mesh, physics heightfield, road mesh, vegetation
// placement, vehicle spawn/reset, autopilot.
//
// OWNER: world worker. The signatures below are frozen - the
// implementation may be replaced wholesale, but getTerrainHeight
// must stay pure/deterministic/cheap, and the road must remain a
// CLOSED loop with its y baked onto the terrain.
// ============================================================

export const WORLD_SIZE = 2000 // metres, square, centred on origin
export const ROAD_WIDTH = 9 //   metres of asphalt

// ---------- corridor geometry (internal, but the world mesh reads some of it) ----------

const SHOULDER = 3.5 //                            dusty verge each side of the asphalt
const RIBBON_HALF = ROAD_WIDTH / 2 + SHOULDER //   8.0 m: half-width of the drawn road ribbon
const FLATTEN_HALF = RIBBON_HALF + 0.8 //          8.8 m: dead-flat corridor, always wider than the ribbon
const BLEND = 30 //                                metres of cut/fill blending back into the hills
const MAX_FLARE = 2.6 //                           extra half-width added through the hairpin
const INFLUENCE = FLATTEN_HALF + MAX_FLARE + BLEND + 1 // beyond this the road cannot affect terrain

/** Half-width of the drawn road ribbon on a straight (asphalt + dusty shoulder). */
export const ROAD_RIBBON_HALF = RIBBON_HALF
/** Largest extra half-width the ribbon flares to in a hairpin. */
export const ROAD_MAX_FLARE = MAX_FLARE

// ---------- the bowl that contains the player (constitution, section 5) ----------
//
// Containment is an ENERGY argument, not a guess. A car at the 190 km/h top speed
// carries 52.8 m/s, so it can convert at most v^2/2g = 142 m of climb before it
// stops - the absolute ceiling, ignoring everything tyres and impacts eat on the way
// up. The rim climbs RIM_RISE metres, back-loaded: the first 55% of the ground gains
// only 30% of the height (rolling foothills you can drive), the last 45% gains 70%
// (an unclimbable rock face). Reaching the face has already spent a third of the
// car's budget, so it arrives with far less climb left in it than the face is tall.
//
// TWO THINGS THE FIRST VERSION GOT WRONG, both art-direction rather than physics:
//
//  1. It was a circle. The road's radius swings between ~420 m and 585 m, so a
//     circular rim loomed right over the corridors where the road runs wide. The rim
//     now follows the ROAD: every bearing's foot sits RIM_FOOT_GAP metres outside the
//     outermost road point on that bearing. Where the circuit tucks in, the bowl
//     opens out. That alone pushed the wall 100 m further back from the north
//     straight and the east sweeper.
//
//  2. It was smooth, which made it read as an embankment - a custard ramp with a
//     pale rock band on top. The foot and crest radii now carry two octaves of
//     seamless noise (buttresses and re-entrants), and the face itself carries a
//     gully field that vanishes at the crest, so the skyline stays clean while the
//     slopes below break up.
//
// The failsafe collider ring (world/boundary.ts) follows the crest, so it is always
// at the top of a rock face and never in open ground.
export const RIM_RISE = 135 //     total vertical relief, valley floor -> plateau
const RIM_FOOT_GAP = 130 //        clear ground between the outermost road point and the first slope
const RIM_SPAN = 285 //            ground covered by foothills + face
const RIM_CREST_CAP = 950 //       the heightfield ends at 1000 m; leave a plateau
const RIM_BEARINGS = 256

// ---------- terrain ----------

function smoothstep01(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * (3 - 2 * t)
}

function gauss2(dx: number, dz: number, sigma: number): number {
  return Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma))
}

/** Anisotropic gaussian in already-rotated local coords. */
function gaussUV(u: number, v: number, su: number, sv: number): number {
  return Math.exp(-((u * u) / (2 * su * su) + (v * v) / (2 * sv * sv)))
}

// ---------- the playground: off-track landforms for a kid who goes exploring ----------
//
// Terrain, not props. They are gaussians summed into baseHeight, so the mesh, the
// heightfield collider and the vegetation scatter all agree about them for free, and
// they cost one distance test each. Every one sits >100 m from the racing line and
// well inside the rim, and none of them is near either of the two hidden sun shards
// (world/Delights.tsx puts those 24 m and 42 m off the road).

export type PlaygroundKind = 'kicker' | 'double' | 'bowl' | 'table'

export interface Playground {
  x: number
  z: number
  /** direction of travel, radians. Ramps face into it. */
  heading: number
  kind: PlaygroundKind
  /** beyond this the feature contributes nothing - used to gate the maths and the scatter */
  reach: number
  what: string
}

export const PLAYGROUNDS: readonly Playground[] = [
  {
    x: -168, z: 44, heading: 2.5, kind: 'kicker', reach: 135,
    what: 'lone kicker in the middle of the loop - a rise, a lip, and the ground drops away',
  },
  {
    x: 214, z: -170, heading: 0.55, kind: 'double', reach: 175,
    what: 'the dare-you double: clear the first mound and the second one launches you',
  },
  {
    x: -272, z: -128, heading: 0, kind: 'bowl', reach: 120,
    what: 'a dished hollow, made for donuts',
  },
  {
    x: 318, z: 8, heading: 3.5, kind: 'table', reach: 150,
    what: 'a flat-topped table: steep up-ramp, 70 m of nothing, steep landing',
  },
]

/** Height these landforms add to the terrain. Zero everywhere outside their reach. */
function playgroundHeight(x: number, z: number): number {
  let h = 0
  for (let i = 0; i < PLAYGROUNDS.length; i++) {
    const p = PLAYGROUNDS[i]
    const dx = x - p.x
    const dz = z - p.z
    if (dx * dx + dz * dz > p.reach * p.reach) continue
    const ca = Math.cos(p.heading)
    const sa = Math.sin(p.heading)
    const u = dx * ca + dz * sa //  along the direction of travel
    const v = -dx * sa + dz * ca // across it

    if (p.kind === 'kicker') {
      // 11 m of rise over 20 m of run, then the ground falls out from under you
      h += 11 * gaussUV(u, v, 20, 34) - 5.5 * gaussUV(u - 52, v, 30, 40)
    } else if (p.kind === 'double') {
      h +=
        9 * gaussUV(u + 34, v, 17, 30) +
        13.5 * gaussUV(u - 32, v, 18, 30) -
        3 * gaussUV(u - 94, v, 34, 40)
    } else if (p.kind === 'bowl') {
      const r = Math.hypot(u, v)
      h += -6.5 * gaussUV(u, v, 30, 30) + 2.4 * Math.exp(-((r - 40) * (r - 40)) / 242)
    } else {
      // flat top between two steep ramps
      h += 9 * (smoothstep01((u + 38) / 30) - smoothstep01((u - 38) / 30)) * gaussUV(0, v, 1, 32)
    }
  }
  return h
}

/**
 * 0..1 - how worn the ground is. The faces a car actually rides get scraped down to
 * dirt, which is also the "something is over there" hint you can read from the road.
 */
export function playgroundWear(x: number, z: number): number {
  let w = 0
  for (let i = 0; i < PLAYGROUNDS.length; i++) {
    const p = PLAYGROUNDS[i]
    const dx = x - p.x
    const dz = z - p.z
    const d2 = dx * dx + dz * dz
    if (d2 > p.reach * p.reach) continue
    const local = Math.abs(playgroundHeightOne(p, dx, dz))
    const k = Math.min(1, local / 6.0) * (1 - smoothstep01((Math.sqrt(d2) - p.reach * 0.55) / (p.reach * 0.45)))
    if (k > w) w = k
  }
  return w
}

function playgroundHeightOne(p: Playground, dx: number, dz: number): number {
  const ca = Math.cos(p.heading)
  const sa = Math.sin(p.heading)
  const u = dx * ca + dz * sa
  const v = -dx * sa + dz * ca
  if (p.kind === 'kicker') return 11 * gaussUV(u, v, 20, 34) - 5.5 * gaussUV(u - 52, v, 30, 40)
  if (p.kind === 'double') {
    return (
      9 * gaussUV(u + 34, v, 17, 30) +
      13.5 * gaussUV(u - 32, v, 18, 30) -
      3 * gaussUV(u - 94, v, 34, 40)
    )
  }
  if (p.kind === 'bowl') {
    const r = Math.hypot(u, v)
    return -6.5 * gaussUV(u, v, 30, 30) + 2.4 * Math.exp(-((r - 40) * (r - 40)) / 242)
  }
  return 9 * (smoothstep01((u + 38) / 30) - smoothstep01((u - 38) / 30)) * gaussUV(0, v, 1, 32)
}

// ---------- the rim table: one foot + crest radius per bearing ----------

const rimFoot = new Float32Array(RIM_BEARINGS)
const rimCrest = new Float32Array(RIM_BEARINGS)
let RIM_MIN_FOOT = Infinity
let RIM_MIN_CREST = Infinity

function tableAt(table: Float32Array, theta: number): number {
  const u = ((theta / (Math.PI * 2)) % 1 + 1) % 1 * RIM_BEARINGS
  const i0 = Math.floor(u) % RIM_BEARINGS
  const i1 = (i0 + 1) % RIM_BEARINGS
  const f = u - Math.floor(u)
  return table[i0] * (1 - f) + table[i1] * f
}

/** Back-loaded: 30% of the height over the first 55% of the ground, 70% over the rest. */
function rimShape(t: number): number {
  return 0.3 * smoothstep01(t / 0.55) + 0.7 * smoothstep01((t - 0.55) / 0.45)
}

/** Rim contribution at a point. Also the value the terrain shader hazes and rocks by. */
export function rimHeightAt(x: number, z: number): number {
  const rm = Math.hypot(x, z)
  if (rm < RIM_MIN_FOOT) return 0
  const th = Math.atan2(z, x)
  const foot = tableAt(rimFoot, th)
  const crest = tableAt(rimCrest, th)
  if (rm >= crest) {
    // plateau, with just enough roll that its skyline is not a ruled line
    const roll = (fbm2D(x * 0.0055 + 21.7, z * 0.0055 + 88.1, 2) - 0.5) * 16
    return RIM_RISE + roll * smoothstep01((rm - crest) / 40)
  }
  const t = (rm - foot) / (crest - foot)
  if (t <= 0) return 0

  // Gullies and buttresses. sin(pi*t) means they die at BOTH the foot and the crest,
  // so the bowl floor stays flat and the skyline stays a clean ridge - all the relief
  // lands on the slopes in between, which is the only place it reads.
  const w = Math.sin(Math.PI * t)
  const g1 = fbm2D(x * 0.011 + 313.4, z * 0.011 + 47.9, 3) - 0.5
  const g2 = fbm2D(x * 0.031 + 5.1, z * 0.031 + 91.3, 2) - 0.5
  return RIM_RISE * rimShape(t) + (g1 * 30 + g2 * 9) * w
}

/** Radius at which the rim tops out, for a bearing. The failsafe ring follows this. */
export function rimCrestRadiusAt(theta: number): number {
  return tableAt(rimCrest, theta)
}

/** The smallest crest radius anywhere. Anything beyond this is behind the boundary. */
export function rimMinCrestRadius(): number {
  return RIM_MIN_CREST
}

/**
 * Terrain before the road cuts into it: broad rolling hills, a rise under the
 * north-east switchback, a basin under the south straight, four playground
 * landforms, and the rim.
 */
function baseHeight(x: number, z: number): number {
  const h1 = (fbm2D(x * 0.00155 + 137.2, z * 0.00155 + 71.5, 4) - 0.5) * 62 // ~645 m hills
  const h2 = (fbm2D(x * 0.0068 + 913.1, z * 0.0068 + 401.7, 3) - 0.5) * 13 //  ~147 m folds
  const h3 = (fbm2D(x * 0.021 + 55.3, z * 0.021 + 12.9, 2) - 0.5) * 2.4 //     ~48 m ripples
  const hill = 36 * gauss2(x - 205, z - 235, 330) //   the switchback climbs this
  const basin = -17 * gauss2(x + 70, z + 380, 300) //  the south straight sits in this
  return h1 + h2 + h3 + hill + basin + playgroundHeight(x, z) + rimHeightAt(x, z)
}

/** Terrain before the road exists. Useful for anything that must ignore the road cut. */
export function getBaseHeight(x: number, z: number): number {
  return baseHeight(x, z)
}

// ---------- the circuit ----------

// Hand-authored plan view of ~3.9 km of road. Clockwise from the south straight.
// Nothing here crosses itself; the two switchback legs stay ~85 m apart so the
// terrain keeps a ridge between them. Index 0 is the start/finish line: it sits a
// little way onto the straight, just past the exit of the last corner, so the car
// spawns pointing down the straight rather than mid-apex.
const CIRCUIT: ReadonlyArray<readonly [number, number]> = [
  [-300, -406], //  0  start / finish. The long south straight, heading +x
  [-190, -412],
  [-60, -415],
  [70, -412], //     3  crest jump #1 sits here - flat out, both wheels leave
  [190, -403],
  [290, -386],
  [375, -352], //    6  turn 1: a fast, opening right
  [438, -292],
  [470, -215],
  [484, -128], //    9  east sweeper, full throttle, climbing
  [486, -40],
  [470, 46],
  [428, 118], //    12  climbing left into the switchback
  [360, 168],
  [276, 180],
  [190, 172], //    15  inbound leg of the switchback
  [120, 158],
  [70, 150], //     17  hairpin entry
  [30, 147],
  [8, 168], //      19  hairpin apex, ~30 m radius
  [14, 200],
  [44, 222],
  [90, 236], //     22  hairpin exit
  [160, 252], //    23  outbound leg, 85 m north of the inbound one
  [240, 262],
  [320, 272],
  [388, 292], //    26  long left onto the north straight
  [424, 340],
  [416, 398],
  [380, 444],
  [280, 468], //    30  north straight, heading -x
  [150, 472], //    31  crest jump #2 sits here
  [10, 464],
  [-120, 446],
  [-250, 406], //   34  the west sweeper: long, fast, downhill all the way
  [-352, 328],
  [-424, 220],
  [-462, 94],
  [-470, -42],
  [-460, -152],
  [-441, -240],
  [-410, -318],
  [-368, -376], //  42  last corner
  [-330, -404], //  43  its exit, already lined up with the straight
]

// ---------- build the rim table from the circuit ----------
//
// Runs at module load, BEFORE buildRoad() calls baseHeight(). It reads the raw circuit
// polyline rather than roadSpline, because the spline does not exist yet - and it does
// not need to: it only wants the road's outermost reach per bearing, to a few metres.
{
  const maxR = new Float32Array(RIM_BEARINGS)
  const CN = CIRCUIT.length
  // Walk the closed polyline at ~0.5 m and record the furthest road point per bearing.
  for (let s = 0; s < CN; s++) {
    const [ax, az] = CIRCUIT[s]
    const [bx, bz] = CIRCUIT[(s + 1) % CN]
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5))
    for (let k = 0; k < steps; k++) {
      const f = k / steps
      const x = ax + (bx - ax) * f
      const z = az + (bz - az) * f
      const r = Math.hypot(x, z)
      const b = Math.floor(((Math.atan2(z, x) / (Math.PI * 2)) % 1 + 1) % 1 * RIM_BEARINGS) % RIM_BEARINGS
      if (r > maxR[b]) maxR[b] = r
    }
  }
  // A rim slope is radial, so a bin only has to clear its own bearing - but take a
  // small circular max anyway, so an interpolated lookup between two bins can never
  // dip inside the road.
  const spread = new Float32Array(RIM_BEARINGS)
  for (let i = 0; i < RIM_BEARINGS; i++) {
    let m = 0
    for (let k = -3; k <= 3; k++) {
      const v = maxR[(i + k + RIM_BEARINGS) % RIM_BEARINGS]
      if (v > m) m = v
    }
    spread[i] = m
  }
  // Smooth it so the bowl opens and closes gently, then re-assert the max: smoothing
  // a peak downward would let the rim swallow the road it was measured from.
  const smooth = new Float32Array(spread)
  smoothCircular(smooth, 9, 2)
  for (let i = 0; i < RIM_BEARINGS; i++) if (spread[i] > smooth[i]) smooth[i] = spread[i]

  let minFoot = Infinity
  let minCrest = Infinity
  for (let i = 0; i < RIM_BEARINGS; i++) {
    const th = (i / RIM_BEARINGS) * Math.PI * 2
    const c = Math.cos(th)
    const s = Math.sin(th)
    // Seamless around the loop: sample the noise on the unit circle, not on the angle.
    const n1 = fbm2D(c * 2.4 + 71.3, s * 2.4 + 71.3, 3) - 0.5 //  buttresses and re-entrants
    const n2 = fbm2D(c * 5.6 + 12.9, s * 5.6 + 12.9, 2) - 0.5 //  finer spurs

    const foot = smooth[i] + RIM_FOOT_GAP + n1 * 80
    let crest = foot + RIM_SPAN + n2 * 60
    if (crest > RIM_CREST_CAP) crest = RIM_CREST_CAP
    if (crest < foot + 140) crest = foot + 140 // never let a bearing become a cliff

    rimFoot[i] = foot
    rimCrest[i] = crest
    if (foot < minFoot) minFoot = foot
    if (crest < minCrest) minCrest = crest
  }
  RIM_MIN_FOOT = minFoot
  RIM_MIN_CREST = minCrest
}

const PROFILE_N = 1024 // samples used to design the elevation profile
const DENSE = 4096 //    samples used for nearest-point queries (~0.95 m apart)

// Crest jumps. Placed by world position, then resolved to arc length.
// A gaussian bump of amplitude A and width sigma has vertical radius R = sigma^2 / A
// at its peak; the car goes airborne above v = sqrt(g * R). A trailing dip gives the
// "drop-away" so it lands on a downslope instead of slamming a flat.
const JUMPS = [
  { anchor: [70, -412] as const, rise: 5.6, sigma: 30, drop: 3.8, dropSigma: 42, dropAt: 95 },
  { anchor: [150, 472] as const, rise: 3.4, sigma: 22, drop: 2.4, dropSigma: 30, dropAt: 64 },
]

function smoothCircular(a: Float32Array, radius: number, passes: number): void {
  const n = a.length
  const tmp = new Float32Array(n)
  const inv = 1 / (radius * 2 + 1)
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      let s = 0
      for (let k = -radius; k <= radius; k++) s += a[(i + k + n) % n]
      tmp[i] = s * inv
    }
    a.set(tmp)
  }
}

/** Shortest signed distance from s to s0 on a loop of length L. */
function wrapDelta(s: number, s0: number, L: number): number {
  let d = s - s0
  if (d > L / 2) d -= L
  if (d < -L / 2) d += L
  return d
}

function gaussS(s: number, s0: number, L: number, sigma: number): number {
  const d = wrapDelta(s, s0, L)
  return Math.exp(-(d * d) / (2 * sigma * sigma))
}

interface BuiltRoad {
  spline: THREE.CatmullRomCurve3
  flareProfile: Float32Array // PROFILE_N entries, metres of extra half-width
}

function buildRoad(): BuiltRoad {
  const planar = new THREE.CatmullRomCurve3(
    CIRCUIT.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
    0.5
  )
  planar.arcLengthDivisions = 4000
  planar.updateArcLengths()

  const pts = planar.getSpacedPoints(PROFILE_N) // PROFILE_N + 1, last duplicates first
  const L = planar.getLength()
  const ds = L / PROFILE_N

  // 1. terrain height under the centre line, smoothed until it is drivable.
  //    The smoothing kernel (~ +/- 31 m) kills the 48 m ripple octave, which would
  //    otherwise make the road bumpy and the physics heightfield inaccurate.
  const h = new Float32Array(PROFILE_N)
  for (let i = 0; i < PROFILE_N; i++) h[i] = baseHeight(pts[i].x, pts[i].z)
  smoothCircular(h, 8, 3)

  // 2. designed elevation features, in arc-length space so they stay periodic
  for (const j of JUMPS) {
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < PROFILE_N; i++) {
      const dx = pts[i].x - j.anchor[0]
      const dz = pts[i].z - j.anchor[1]
      const d = dx * dx + dz * dz
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    const s0 = best * ds
    for (let i = 0; i < PROFILE_N; i++) {
      const s = i * ds
      h[i] += j.rise * gaussS(s, s0, L, j.sigma)
      h[i] -= j.drop * gaussS(s, s0 + j.dropAt, L, j.dropSigma)
    }
  }

  // 3. curvature -> width flare (the hairpin opens out)
  const curv = new Float32Array(PROFILE_N)
  const W = 3
  for (let i = 0; i < PROFILE_N; i++) {
    const a = pts[(i - W + PROFILE_N) % PROFILE_N]
    const b = pts[i]
    const c = pts[(i + W) % PROFILE_N]
    const v1x = b.x - a.x
    const v1z = b.z - a.z
    const v2x = c.x - b.x
    const v2z = c.z - b.z
    const l1 = Math.hypot(v1x, v1z) || 1e-6
    const l2 = Math.hypot(v2x, v2z) || 1e-6
    let cosA = (v1x * v2x + v1z * v2z) / (l1 * l2)
    cosA = cosA > 1 ? 1 : cosA < -1 ? -1 : cosA
    curv[i] = Math.acos(cosA) / (W * ds)
  }
  smoothCircular(curv, 6, 2)

  const K0 = 1 / 95 //  no flare above a 95 m radius
  const K1 = 1 / 40 //  full flare at a 40 m radius (the hairpin is ~30 m)
  const flareProfile = new Float32Array(PROFILE_N)
  for (let i = 0; i < PROFILE_N; i++) {
    flareProfile[i] = smoothstep01((curv[i] - K0) / (K1 - K0)) * MAX_FLARE
  }
  smoothCircular(flareProfile, 8, 2)

  // 4. decimate to control points (every 4th, ~15 m apart) and lift into 3D
  const cps: THREE.Vector3[] = []
  for (let i = 0; i < PROFILE_N; i += 4) cps.push(new THREE.Vector3(pts[i].x, h[i], pts[i].z))

  const spline = new THREE.CatmullRomCurve3(cps, true, 'centripetal', 0.5)
  spline.arcLengthDivisions = 4000
  spline.updateArcLengths()
  return { spline, flareProfile }
}

const built = buildRoad()

export const roadSpline: THREE.CatmullRomCurve3 = built.spline
export const ROAD_LENGTH: number = roadSpline.getLength()

// ---------- dense sample table + spatial grid ----------

const RX = new Float32Array(DENSE)
const RY = new Float32Array(DENSE)
const RZ = new Float32Array(DENSE)
const RTX = new Float32Array(DENSE) // unit tangent, xz plane
const RTZ = new Float32Array(DENSE)
const RF = new Float32Array(DENSE) // width flare at this sample

{
  const sp = roadSpline.getSpacedPoints(DENSE) // DENSE + 1, last duplicates first
  for (let i = 0; i < DENSE; i++) {
    RX[i] = sp[i].x
    RY[i] = sp[i].y
    RZ[i] = sp[i].z
    const f = (i / DENSE) * PROFILE_N
    const f0 = Math.floor(f) % PROFILE_N
    const f1 = (f0 + 1) % PROFILE_N
    const ft = f - Math.floor(f)
    RF[i] = built.flareProfile[f0] * (1 - ft) + built.flareProfile[f1] * ft
  }
  for (let i = 0; i < DENSE; i++) {
    const a = (i - 1 + DENSE) % DENSE
    const b = (i + 1) % DENSE
    const dx = RX[b] - RX[a]
    const dz = RZ[b] - RZ[a]
    const l = Math.hypot(dx, dz) || 1
    RTX[i] = dx / l
    RTZ[i] = dz / l
  }
}

/**
 * Read-only view of the road, sampled at ~0.95 m. World generation walks this
 * instead of hammering the curve's binary search.
 */
export const ROAD_DENSE = {
  count: DENSE,
  x: RX as Readonly<Float32Array>,
  y: RY as Readonly<Float32Array>,
  z: RZ as Readonly<Float32Array>,
  tx: RTX as Readonly<Float32Array>,
  tz: RTZ as Readonly<Float32Array>,
  flare: RF as Readonly<Float32Array>,
  spacing: ROAD_LENGTH / DENSE,
}

// Uniform grid over the road samples. Query cost is ~25 cell probes for anything
// inside the road's influence radius, which is what makes getTerrainHeight cheap
// enough to call a few hundred thousand times while building the world.
const CELL = 24
const GN = Math.ceil(WORLD_SIZE / CELL)
const gridStart = new Int32Array(GN * GN + 1)
const gridItems = new Int32Array(DENSE)

function cellIndex(v: number): number {
  const i = Math.floor((v + WORLD_SIZE / 2) / CELL)
  return i < 0 ? 0 : i >= GN ? GN - 1 : i
}

{
  const counts = new Int32Array(GN * GN)
  for (let i = 0; i < DENSE; i++) counts[cellIndex(RX[i]) + cellIndex(RZ[i]) * GN]++
  let acc = 0
  for (let c = 0; c < GN * GN; c++) {
    gridStart[c] = acc
    acc += counts[c]
  }
  gridStart[GN * GN] = acc
  const cursor = gridStart.slice(0, GN * GN)
  for (let i = 0; i < DENSE; i++) {
    const c = cellIndex(RX[i]) + cellIndex(RZ[i]) * GN
    gridItems[cursor[c]++] = i
  }
}

let _bestD2 = 0

/** Nearest dense sample index within `maxR`, or -1. Writes `_bestD2`. */
function nearestSample(x: number, z: number, maxR: number): number {
  const rings = Math.ceil(maxR / CELL)
  const cx = cellIndex(x)
  const cz = cellIndex(z)
  const x0 = Math.max(0, cx - rings)
  const x1 = Math.min(GN - 1, cx + rings)
  const z0 = Math.max(0, cz - rings)
  const z1 = Math.min(GN - 1, cz + rings)
  let best = -1
  let bestD2 = maxR * maxR
  for (let gz = z0; gz <= z1; gz++) {
    const row = gz * GN
    for (let gx = x0; gx <= x1; gx++) {
      const c = gx + row
      for (let k = gridStart[c], e = gridStart[c + 1]; k < e; k++) {
        const i = gridItems[k]
        const dx = RX[i] - x
        const dz = RZ[i] - z
        const d2 = dx * dx + dz * dz
        if (d2 < bestD2) {
          bestD2 = d2
          best = i
        }
      }
    }
  }
  _bestD2 = bestD2
  return best
}

// Projection scratch - module level, never allocated per call.
let _px = 0
let _py = 0
let _pz = 0
let _pflare = 0
let _pt = 0

/**
 * Exact XZ distance from (x,z) to the road polyline near sample `i`, projecting
 * onto the two adjacent segments. Writes _px/_py/_pz/_pflare/_pt.
 */
function projectRoad(i: number, x: number, z: number): number {
  let bestD2 = Infinity
  for (let k = 0; k < 2; k++) {
    const a = k === 0 ? (i - 1 + DENSE) % DENSE : i
    const b = (a + 1) % DENSE
    const ax = RX[a]
    const az = RZ[a]
    const ex = RX[b] - ax
    const ez = RZ[b] - az
    const len2 = ex * ex + ez * ez
    let t = len2 > 0 ? ((x - ax) * ex + (z - az) * ez) / len2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const px = ax + ex * t
    const pz = az + ez * t
    const dx = x - px
    const dz = z - pz
    const d2 = dx * dx + dz * dz
    if (d2 < bestD2) {
      bestD2 = d2
      _px = px
      _pz = pz
      _py = RY[a] + (RY[b] - RY[a]) * t
      _pflare = RF[a] + (RF[b] - RF[a]) * t
      _pt = (a + t) / DENSE
    }
  }
  return Math.sqrt(bestD2)
}

/** Terrain height (m) at world x,z. Pure + deterministic. Flattens toward the road. */
export function getTerrainHeight(x: number, z: number): number {
  const i = nearestSample(x, z, INFLUENCE + 1)
  if (i < 0) return baseHeight(x, z)
  const d = projectRoad(i, x, z)
  const half = FLATTEN_HALF + _pflare
  if (d <= half) return _py
  const b = (d - half) / BLEND
  if (b >= 1) return baseHeight(x, z)
  const s = b * b * (3 - 2 * b)
  return _py * (1 - s) + baseHeight(x, z) * s
}

/** Distance (m) from (x,z) to the road centre line, or Infinity beyond `maxDist`. */
export function roadDistance(x: number, z: number, maxDist: number): number {
  const i = nearestSample(x, z, maxDist + 1)
  if (i < 0) return Infinity
  const d = projectRoad(i, x, z)
  return d > maxDist ? Infinity : d
}

/**
 * Distance (m) from (x,z) out to the *edge* of the drawn road ribbon (flare aware).
 * Negative means the point is on the road. Infinity beyond the search radius.
 */
export function roadEdgeDistance(x: number, z: number, searchRadius: number): number {
  const i = nearestSample(x, z, searchRadius + RIBBON_HALF + MAX_FLARE + 1)
  if (i < 0) return Infinity
  const d = projectRoad(i, x, z)
  return d - (RIBBON_HALF + _pflare)
}

/**
 * Nearest point on the road to world (x,z). Allocates the result - fine for
 * occasional calls (reset, spawn, world generation); per-frame callers should
 * advance along the spline with getPointAt(t) instead.
 */
export function nearestRoadPoint(
  x: number,
  z: number
): { point: THREE.Vector3; tangent: THREE.Vector3; t: number } {
  let i = -1
  for (let r = CELL * 2; i < 0 && r < WORLD_SIZE * 2; r *= 2) i = nearestSample(x, z, r)
  if (i < 0) i = nearestSample(x, z, WORLD_SIZE * 2)
  // Widen once more so a sample in a not-yet-scanned cell cannot beat the winner.
  const guarantee = Math.sqrt(_bestD2) + CELL * 1.5
  i = nearestSample(x, z, guarantee)
  projectRoad(i, x, z)
  return {
    point: new THREE.Vector3(_px, _py, _pz),
    tangent: roadSpline.getTangentAt(_pt),
    t: _pt,
  }
}

/** Vehicle spawn: on the road at t=0, facing along the tangent. */
export function getSpawn(): { position: THREE.Vector3; rotationY: number } {
  const p = roadSpline.getPointAt(0)
  const tan = roadSpline.getTangentAt(0)
  return {
    position: new THREE.Vector3(p.x, p.y + 1.2, p.z),
    rotationY: Math.atan2(tan.x, tan.z),
  }
}

// ---------- start / finish line position ----------
/**
 * Where the start/finish line sits, as road-spline t in [0,1). Lap timing
 * (vehicle/lapTracker.ts) and the painted line (world/StartLine.tsx) BOTH key
 * off this - change it here and the whole lap moves together.
 */
export const START_LINE_T = 0
