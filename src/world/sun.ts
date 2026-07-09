import * as THREE from 'three'
import { CONFIG } from '../core/config'

// ============================================================
// Where the sun is. ONE answer, shared by the sky shader (world)
// and the lighting rig (fx) so the disc in the sky and the
// direction of every shadow agree.
// ============================================================

// CONFIG.timeOfDay: 0 = late golden afternoon, 1 = sun kissing the horizon.
const ELEVATION_AFTERNOON = 25 // degrees above the horizon
const ELEVATION_SUNSET = 8
const AZIMUTH_AFTERNOON = 118 // degrees, clockwise from +z
const AZIMUTH_SUNSET = 101

const DEG = Math.PI / 180

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function timeOfDay(): number {
  const t = CONFIG.timeOfDay
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** Sun elevation above the horizon, in degrees. */
export function getSunElevationDeg(): number {
  return lerp(ELEVATION_AFTERNOON, ELEVATION_SUNSET, timeOfDay())
}

/** Sun azimuth in degrees, measured clockwise from the +z axis. */
export function getSunAzimuthDeg(): number {
  return lerp(AZIMUTH_AFTERNOON, AZIMUTH_SUNSET, timeOfDay())
}

/**
 * Unit vector pointing FROM the world origin TOWARD the sun.
 *
 * The directional light lives at `getSunDirection().multiplyScalar(distance)`;
 * light therefore travels along the negation of this vector. The sky dome puts
 * its sun disc exactly here. Allocates - call it on mount, not per frame.
 */
export function getSunDirection(): THREE.Vector3 {
  const el = getSunElevationDeg() * DEG
  const az = getSunAzimuthDeg() * DEG
  const c = Math.cos(el)
  return new THREE.Vector3(c * Math.sin(az), Math.sin(el), c * Math.cos(az)).normalize()
}

/** Warm sun colour from the constitution's palette. */
export const SUN_COLOR = '#FFD9A8'
