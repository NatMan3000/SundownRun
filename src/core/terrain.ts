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

// ---------- terrain ----------

/** Terrain height (m) at world x,z. Pure + deterministic. Flattens toward the road. */
export function getTerrainHeight(x: number, z: number): number {
  const base = baseHeight(x, z)
  const road = nearestRoadPoint(x, z)
  const d = Math.hypot(x - road.point.x, z - road.point.z)
  // Blend terrain flat onto the road surface within the corridor
  const half = ROAD_WIDTH / 2 + 2
  if (d < half) return road.point.y
  const blend = Math.min(1, (d - half) / 30)
  const s = blend * blend * (3 - 2 * blend)
  return road.point.y * (1 - s) + base * s
}

function baseHeight(x: number, z: number): number {
  const n = fbm2D(x * 0.003 + 100, z * 0.003 + 100, 4)
  return (n - 0.45) * 60
}

// ---------- road ----------

// Placeholder: a rounded loop. World worker replaces control points with an
// organic circuit; y of every control point MUST equal the terrain base there
// (the flattening blend above then welds terrain to road).
function buildSpline(): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = []
  const R = 320
  const N = 16
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    const x = Math.cos(a) * R
    const z = Math.sin(a) * R * 0.72
    pts.push(new THREE.Vector3(x, baseHeight(x, z), z))
  }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5)
}

export const roadSpline: THREE.CatmullRomCurve3 = buildSpline()
export const ROAD_LENGTH: number = roadSpline.getLength()

// Sampled lookup table for nearest-point queries (reset, autopilot, flattening).
const SAMPLES = 2048
const samplePts: THREE.Vector3[] = roadSpline.getSpacedPoints(SAMPLES)

/**
 * Nearest point on the road to world (x,z). Allocates the result - fine for
 * occasional calls (reset, spawn, world generation); per-frame callers should
 * advance along the spline with getPointAt(t) instead.
 */
export function nearestRoadPoint(
  x: number,
  z: number
): { point: THREE.Vector3; tangent: THREE.Vector3; t: number } {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < samplePts.length; i++) {
    const p = samplePts[i]
    const dx = p.x - x
    const dz = p.z - z
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  const t = best / SAMPLES
  return {
    point: samplePts[best].clone(),
    tangent: roadSpline.getTangentAt(t),
    t,
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
