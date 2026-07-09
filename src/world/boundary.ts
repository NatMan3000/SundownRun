import { RIM_RISE, WORLD_SIZE, getTerrainHeight, rimCrestRadiusAt, rimMinCrestRadius } from '../core/terrain'
import { lowestTerrain } from './heightfield'

// ============================================================
// The failsafe that backs up the rim (constitution, section 5).
//
// core/terrain.ts already makes the bowl unclimbable by energy - see the note there.
// This ring exists for the case that argument does not cover: a player who turns
// CONFIG.enginePower or topSpeedKmh up past the point where 142 m of climb is the
// ceiling. It is invisible, buried in the rock, and it FOLLOWS THE CREST rather than
// sitting on a circle, so wherever you touch it you are standing on top of a
// mountainside that took 180 m of climbing to reach. That is what you see.
//
// Pure data so the headless containment test and the collider component build the
// same ring from the same numbers.
// ============================================================

export const BOUNDARY = {
  segments: 128,
  /** how far inside the crest the slabs sit */
  inset: 14,
  /** 24 m thick. The car has CCD, but a wall you cannot tunnel is cheaper than one you can. */
  halfThickness: 12,
  /**
   * 840 m tall, and that is not paranoia. An over-speed car can punch THROUGH the
   * rock face (see CATCH_FLOOR below), and the first version of this wall was only
   * buried 60 m - so a tunnelled car sailed underneath it and out to r=3995 m. The
   * slab now reaches from below the catch floor to far above the rim: there is no
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
 * assault on the rim from any bearing peaks at a few m/s of descent - so this never
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

/** The tightest point of the ring. Nothing beyond this is reachable. */
export function boundaryMinRadius(): number {
  return rimMinCrestRadius() - BOUNDARY.inset
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
  const { segments, inset } = BOUNDARY
  const out: BoundarySegment[] = []
  for (let i = 0; i < segments; i++) {
    const th = ((i + 0.5) / segments) * Math.PI * 2
    const radius = rimCrestRadiusAt(th) - inset
    // Half-length from the ANGULAR step at this radius, plus generous overlap. The
    // crest radius varies by ~150 m around the loop, so a fixed length would leave
    // wedges of daylight between slabs where the bowl opens out.
    const halfLength = radius * Math.sin(Math.PI / segments) * 1.5
    const x = Math.cos(th) * radius
    const z = Math.sin(th) * radius
    // Rotate so the slab's local X runs along the tangent and its local Z (the thin
    // axis) points radially.
    const rotY = Math.atan2(-Math.cos(th), -Math.sin(th))
    // Lift off the crest height, not off the sampled terrain: the gully noise dies at
    // the crest, so RIM_RISE is what the ground is doing there, give or take the hills.
    const y = Math.max(getTerrainHeight(x, z), RIM_RISE * 0.7) + BOUNDARY.lift
    out.push({ x, y, z, rotY, halfLength })
  }
  cached = out
  return out
}
