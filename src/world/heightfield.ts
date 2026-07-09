import { WORLD_SIZE, getTerrainHeight } from '../core/terrain'

// ============================================================
// ONE set of height samples feeds BOTH the terrain mesh and the
// rapier heightfield collider. The car therefore lands on exactly
// what the eye sees - no invisible bumps, no floating wheels.
//
// 320 segments over 2000 m = 6.25 m cells. Measured worst-case gap
// between the collider's triangulated cells and the road surface,
// sampled right across the asphalt for the whole lap: 5.1 cm, mean
// 0.31 cm. The worst point is the face of crest jump #2, which has
// the tightest vertical radius (125 m) - and where the car is in the
// air anyway. Budget is 10 cm.
// ============================================================

export const TERRAIN_RES = 320
const N = TERRAIN_RES + 1
const STEP = WORLD_SIZE / TERRAIN_RES

export function latticeCoord(i: number): number {
  return i * STEP - WORLD_SIZE / 2
}

let cached: Float32Array | null = null

/** Heights on the lattice. Index with `ix + iz * (TERRAIN_RES + 1)`. */
export function getHeightLattice(): Float32Array {
  if (cached) return cached
  const h = new Float32Array(N * N)
  for (let iz = 0; iz < N; iz++) {
    const z = latticeCoord(iz)
    for (let ix = 0; ix < N; ix++) {
      h[ix + iz * N] = getTerrainHeight(latticeCoord(ix), z)
    }
  }
  cached = h
  return h
}

let rapierCached: number[] | null = null

/**
 * The same heights, re-ordered for rapier.
 *
 * rapier stores a heightfield as a column-major matrix where the ROW index runs
 * along local z and the COLUMN index runs along local x, so the linear index is
 * `iz + ix * (nrows + 1)` - the transpose of our lattice. Verified empirically by
 * building a heightfield whose height depends only on x and raycasting it; the
 * other ordering rotates the whole world 90 degrees under the player's wheels.
 */
export function getRapierHeights(): number[] {
  if (rapierCached) return rapierCached
  const h = getHeightLattice()
  const out = new Array<number>(N * N)
  for (let ix = 0; ix < N; ix++) {
    for (let iz = 0; iz < N; iz++) {
      out[iz + ix * N] = h[ix + iz * N]
    }
  }
  rapierCached = out
  return out
}

/** Analytic surface normal from the lattice, cheaper and smoother than face averaging. */
export function latticeNormal(ix: number, iz: number, out: [number, number, number]): void {
  const h = getHeightLattice()
  const xm = ix > 0 ? ix - 1 : ix
  const xp = ix < N - 1 ? ix + 1 : ix
  const zm = iz > 0 ? iz - 1 : iz
  const zp = iz < N - 1 ? iz + 1 : iz
  const dx = (h[xp + iz * N] - h[xm + iz * N]) / ((xp - xm) * STEP)
  const dz = (h[ix + zp * N] - h[ix + zm * N]) / ((zp - zm) * STEP)
  const len = Math.hypot(dx, 1, dz)
  out[0] = -dx / len
  out[1] = 1 / len
  out[2] = -dz / len
}
