import { BOUNDARY_RADIUS, WORLD_SIZE, getTerrainHeight } from '../core/terrain'
import { lowestTerrain } from './heightfield'

// ============================================================
// The failsafe that backs up the rim (constitution, section 5).
//
// core/terrain.ts already makes the bowl unclimbable by energy - see the note
// there. This ring exists for the case that argument does not cover: a player who
// turns CONFIG.enginePower or topSpeedKmh up past the point where 142 m of climb
// is the ceiling. It is invisible, buried 60 m into the rock, and sits at r=858
// where the terrain has already risen 144 m at 71 degrees. By the time you can
// touch it you are a long way up a mountainside, and that is what you see.
//
// Pure data so the headless containment test and the collider component build the
// same ring from the same numbers.
// ============================================================

export const BOUNDARY = {
  radius: BOUNDARY_RADIUS,
  segments: 96,
  /** 24 m thick. The car has CCD, but a wall you cannot tunnel is cheaper than one you can. */
  halfThickness: 12,
  /**
   * 840 m tall, and that is not paranoia. An over-speed car can punch THROUGH the
   * cliff face (see CATCH_FLOOR below), and the first version of this wall was only
   * buried 60 m - so a tunnelled car sailed underneath it and out to r=3995 m. The
   * slab now reaches from below the catch floor to 560 m above the rim: there is no
   * altitude, over or under, at which the ring is not there.
   */
  halfHeight: 420,
  /** Segment centres ride this far above the terrain under them. */
  lift: 160,
}

/**
 * The last line of defence, and the only one that is not about the rim.
 *
 * A rapier heightfield is an infinitely thin surface. Measured with the real 1200 kg
 * chassis: once the box sinks past its own centre inside a single 1/60 s step - beyond
 * roughly 28 m/s of downward speed - the contact can simply fail to generate and the
 * car drops straight through. It is not a clean threshold either: 28 lands, 30 falls
 * through, 40 lands, 60 lands, 100 falls through. It depends on where the step boundary
 * happens to land relative to the surface. Rapier's CCD does not save you - CCD arms on
 * the collider's own thickness, and half a metre of travel per step is under that bar.
 *
 * Nothing in the drivable bowl can fall far enough to reach 28 m/s - a full-throttle
 * assault on the rim from any bearing peaks at 4.3 m/s of descent - so this never
 * fires in a normal game. It exists because "no reachable route lets the car fall
 * off" has to hold even after a 12-year-old edits CONFIG.topSpeedKmh to 500. A car
 * that does punch through lands here instead of falling forever, and R puts it back
 * on the road.
 */
export const CATCH_FLOOR = {
  get y(): number {
    // top face 25 m under the lowest ground, then the slab's centre 200 m below that
    return lowestTerrain() - 25 - 200
  },
  halfY: 200,
  /** Deliberately far wider than the world: a static cuboid's size costs nothing. */
  halfXZ: WORLD_SIZE * 1.5,
}

export interface BoundarySegment {
  x: number
  y: number
  z: number
  rotY: number
  halfLength: number
}

let cached: BoundarySegment[] | null = null

export function boundarySegments(): BoundarySegment[] {
  if (cached) return cached
  const { radius, segments } = BOUNDARY
  // 8% overlap: consecutive slabs interpenetrate, so there is no seam to thread
  const halfLength = radius * Math.sin(Math.PI / segments) * 1.08
  const out: BoundarySegment[] = []
  for (let i = 0; i < segments; i++) {
    const th = ((i + 0.5) / segments) * Math.PI * 2
    const x = Math.cos(th) * radius
    const z = Math.sin(th) * radius
    // Rotate so the slab's local X runs along the tangent and its local Z (the thin
    // axis) points radially.
    const rotY = Math.atan2(-Math.cos(th), -Math.sin(th))
    out.push({ x, y: getTerrainHeight(x, z) + BOUNDARY.lift, z, rotY, halfLength })
  }
  cached = out
  return out
}
