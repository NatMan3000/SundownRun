import * as THREE from 'three'
import type { CarBodyId } from '../core/store'
import { WHEEL } from './tuning'

// ============================================================
//  FOUR BODIES, ONE RECIPE
// ------------------------------------------------------------
//  Every car in the garage is the same construction: a 2D side
//  profile in the z/y plane, extruded across the width with a
//  small hard chamfer, with the wheel arches cut into the profile
//  as clean arcs. Change the profile, change the car.
//
//  What a variant may NOT change: the wheels, the hub positions,
//  the physics footprint (CHASSIS.halfExtents is x 0.88, z 2.00),
//  or anything in the swap contract. Bodies are paint, not physics.
//
//  What gives each one its personality is almost entirely the
//  `top` line and where the greenhouse sits on it:
//
//    coupe    long bonnet, cab-rearward, fastback, Kamm chop.
//    striker  cab-FORWARD, stubby overhangs, tall boxy greenhouse,
//             roof spoiler. Wheels almost at the corners.
//    muscle   long low bonnet, wide flat roof, squat and heavy.
//    wedge    one straight rising line from a pointed nose to a
//             high tail, with a low canopy sunk into it.
// ============================================================

export const HUB_Y = -0.2
export const VIS_RADIUS = 0.35
export const WHEEL_WIDTH = 0.285
/** Outer face of a tyre: 0.9425 m. Every body stays inboard of this. */
export const WHEEL_OUTER = WHEEL.halfTrack + WHEEL_WIDTH / 2

type Vec = THREE.Vector2
const v2 = (x: number, y: number) => new THREE.Vector2(x, y)

/** A box, positioned and optionally raked. Shared by every variant's details. */
export interface BoxSpec {
  w: number
  h: number
  d: number
  x: number
  y: number
  z: number
  rx?: number
}

export interface PillarSpec {
  z0: number
  y0: number
  z1: number
  y1: number
  thick: number
  width: number
  x: number
}

export interface BodySpec {
  bodyHalf: number
  bevelT: number
  bevelS: number
  sillY: number
  archR: number

  zNose: number
  noseBotY: number
  noseTopZ: number
  noseTopY: number
  /** Bonnet -> beltline -> deck -> ducktail, ending at (zTail, tailTopY). */
  top: Vec[]
  zTail: number
  tailBotY: number
  /** From (zTail, tailBotY) forward, down to the sill line. */
  rearValance: Vec[]
  /** From the front arch exit forward to the nose bottom. */
  frontValance: Vec[]

  /** Diamond-section crease down each flank. */
  swage: { y: number; z: number; len: number; rx: number }

  glassHalf: number
  roofHalf: number
  /** Cowl -> screen top -> roof -> backlight base. Closes along a straight base. */
  glass: Vec[]
  /** Band lying over the roof: base fore-to-aft, then top aft-to-fore. */
  roof: Vec[]
  pillars: PillarSpec[]
  mirror: { x: number; y: number; z: number }
  /** Painted wing above the backlight. Striker only. */
  spoiler?: BoxSpec

  grille: BoxSpec
  intake?: BoxSpec
  /** Mirrored in x. */
  headlight: BoxSpec
  headlightStrip?: BoxSpec

  tailPanel: BoxSpec
  tailBar: BoxSpec
  tailPod: BoxSpec
  reverse: BoxSpec

  splitter: BoxSpec
  diffuser: BoxSpec
  exhaust: { x: number; y: number; z: number }
  /** Sill strips hug the rocker between the arches. */
  sillOffsetX: number
}

// ---------- the profile, assembled ----------

/**
 * Cut a wheel arch into the underside: a clean circular arc from the sill, up
 * over the hub, and back down. 24 segments - enough that the rim reads as a
 * curve, not a polygon.
 */
function archArc(pts: Vec[], cz: number, r: number, sillY: number): void {
  const dy = sillY - HUB_Y
  const dz = Math.sqrt(r * r - dy * dy)
  const enter = Math.atan2(dy, -dz) + Math.PI * 2
  const exit = Math.atan2(dy, dz)
  const N = 24
  for (let i = 0; i <= N; i++) {
    const a = enter + (exit - enter) * (i / N)
    pts.push(v2(cz + r * Math.cos(a), HUB_Y + r * Math.sin(a)))
  }
}

/** Half-chord of an arch at the sill line. Also where the sill strips must stop. */
export function archHalfChord(s: BodySpec): number {
  const dy = s.sillY - HUB_Y
  return Math.sqrt(s.archR * s.archR - dy * dy)
}

export function buildProfile(s: BodySpec): THREE.Shape {
  const dz = archHalfChord(s)
  const hb = WHEEL.halfBase
  const p: Vec[] = [v2(s.zNose, s.noseBotY), v2(s.noseTopZ, s.noseTopY), ...s.top]
  p.push(v2(s.zTail, s.tailBotY))
  p.push(...s.rearValance)
  p.push(v2(-hb - dz, s.sillY))
  archArc(p, -hb, s.archR, s.sillY)
  p.push(v2(hb - dz, s.sillY))
  archArc(p, hb, s.archR, s.sillY)
  p.push(...s.frontValance)
  return new THREE.Shape(p)
}

export function buildGlassShape(s: BodySpec): THREE.Shape {
  return new THREE.Shape(s.glass)
}

export function buildRoofShape(s: BodySpec): THREE.Shape {
  return new THREE.Shape(s.roof)
}

// ============================================================
//  THE GARAGE
// ============================================================

const coupe: BodySpec = {
  bodyHalf: 0.855,
  bevelT: 0.075,
  bevelS: 0.034,
  sillY: -0.32,
  archR: 0.43,

  zNose: 2.02,
  noseBotY: -0.165,
  noseTopZ: 1.985,
  noseTopY: 0.155,
  top: [
    v2(1.93, 0.245),
    v2(1.7, 0.288),
    v2(1.3, 0.325),
    v2(0.98, 0.318), //   cowl
    v2(0.2, 0.331),
    v2(-0.5, 0.352), //   beltline rises toward the rear
    v2(-1.05, 0.379), //  haunch
    v2(-1.45, 0.362),
    v2(-1.75, 0.344),
    v2(-1.88, 0.338),
    v2(-1.93, 0.362), //  ducktail
    v2(-1.95, 0.346),
  ],
  zTail: -1.95,
  tailBotY: -0.08,
  rearValance: [v2(-1.9, -0.24)],
  frontValance: [v2(1.925, -0.278)],

  swage: { y: 0.105, z: 0.02, len: 3.28, rx: 0 },

  glassHalf: 0.79,
  roofHalf: 0.822,
  glass: [v2(0.98, 0.3), v2(0.22, 0.575), v2(-0.3, 0.615), v2(-0.6, 0.612), v2(-0.86, 0.588), v2(-1.45, 0.33)],
  roof: [
    v2(-0.86, 0.532),
    v2(-0.6, 0.556),
    v2(-0.3, 0.559),
    v2(0.22, 0.519),
    v2(0.22, 0.575),
    v2(-0.3, 0.615),
    v2(-0.6, 0.612),
    v2(-0.86, 0.588),
  ],
  pillars: [
    { z0: 0.96, y0: 0.325, z1: 0.25, y1: 0.558, thick: 0.065, width: 0.055, x: 0.806 },
    { z0: -0.88, y0: 0.575, z1: -1.42, y1: 0.348, thick: 0.075, width: 0.095, x: 0.802 },
  ],
  mirror: { x: 0.885, y: 0.372, z: 0.79 },

  grille: { w: 1.44, h: 0.205, d: 0.03, x: 0, y: -0.012, z: 2.019, rx: -0.108 },
  intake: { w: 1.02, h: 0.07, d: 0.03, x: 0, y: -0.172, z: 2.014, rx: -0.108 },
  headlight: { w: 0.34, h: 0.075, d: 0.02, x: 0.46, y: 0.038, z: 2.026, rx: -0.108 },
  headlightStrip: { w: 0.22, h: 0.018, d: 0.018, x: 0.487, y: -0.058, z: 2.014, rx: -0.108 },

  tailPanel: { w: 1.46, h: 0.225, d: 0.03, x: 0, y: 0.2, z: -1.963 },
  tailBar: { w: 1.36, h: 0.05, d: 0.025, x: 0, y: 0.232, z: -1.972 },
  tailPod: { w: 0.3, h: 0.088, d: 0.025, x: 0.5, y: 0.232, z: -1.972 },
  reverse: { w: 0.14, h: 0.045, d: 0.02, x: 0.3, y: 0.128, z: -1.97 },

  splitter: { w: 1.5, h: 0.045, d: 0.3, x: 0, y: -0.302, z: 1.78 },
  diffuser: { w: 1.08, h: 0.13, d: 0.28, x: 0, y: -0.215, z: -1.85 },
  exhaust: { x: 0.32, y: -0.155, z: -1.97 },
  sillOffsetX: 0.842,
}

// Octane-inspired: cab shoved forward over a stubby nose, a tall boxy
// greenhouse and a roof wing. Wheels sit almost at the corners.
const striker: BodySpec = {
  bodyHalf: 0.87,
  bevelT: 0.075,
  bevelS: 0.036,
  sillY: -0.32,
  archR: 0.42,

  zNose: 1.88,
  noseBotY: -0.2,
  noseTopZ: 1.83,
  noseTopY: 0.235,
  top: [
    v2(1.74, 0.335),
    v2(1.55, 0.365),
    v2(1.35, 0.375), //   the bonnet is over almost before it starts
    v2(0.9, 0.382),
    v2(0.2, 0.395),
    v2(-0.5, 0.408),
    v2(-1.0, 0.415),
    v2(-1.45, 0.4),
    v2(-1.72, 0.385),
    v2(-1.84, 0.404), // ducktail
    v2(-1.88, 0.386),
  ],
  zTail: -1.88,
  tailBotY: -0.1,
  rearValance: [v2(-1.845, -0.26)],
  frontValance: [v2(1.855, -0.27)],

  swage: { y: 0.13, z: 0.0, len: 3.0, rx: 0 },

  glassHalf: 0.765,
  roofHalf: 0.8,
  glass: [v2(1.3, 0.36), v2(0.85, 0.655), v2(0.2, 0.685), v2(-0.35, 0.678), v2(-0.85, 0.4)],
  roof: [
    v2(-0.35, 0.618),
    v2(0.2, 0.625),
    v2(0.85, 0.595),
    v2(0.85, 0.655),
    v2(0.2, 0.685),
    v2(-0.35, 0.678),
  ],
  pillars: [
    { z0: 1.28, y0: 0.375, z1: 0.87, y1: 0.64, thick: 0.075, width: 0.06, x: 0.782 },
    { z0: -0.37, y0: 0.665, z1: -0.84, y1: 0.415, thick: 0.085, width: 0.1, x: 0.778 },
  ],
  mirror: { x: 0.9, y: 0.42, z: 1.1 },
  spoiler: { w: 1.3, h: 0.045, d: 0.22, x: 0, y: 0.712, z: -0.44, rx: -0.14 },

  grille: { w: 1.48, h: 0.2, d: 0.03, x: 0, y: -0.03, z: 1.892, rx: -0.114 },
  intake: { w: 1.06, h: 0.075, d: 0.03, x: 0, y: -0.185, z: 1.885, rx: -0.114 },
  headlight: { w: 0.3, h: 0.095, d: 0.02, x: 0.5, y: 0.14, z: 1.877, rx: -0.114 },

  tailPanel: { w: 1.5, h: 0.26, d: 0.03, x: 0, y: 0.2, z: -1.893 },
  tailBar: { w: 1.3, h: 0.055, d: 0.025, x: 0, y: 0.245, z: -1.902 },
  tailPod: { w: 0.3, h: 0.1, d: 0.025, x: 0.52, y: 0.245, z: -1.902 },
  reverse: { w: 0.15, h: 0.045, d: 0.02, x: 0.32, y: 0.1, z: -1.9 },

  splitter: { w: 1.52, h: 0.045, d: 0.26, x: 0, y: -0.302, z: 1.66 },
  diffuser: { w: 1.12, h: 0.14, d: 0.26, x: 0, y: -0.22, z: -1.78 },
  exhaust: { x: 0.34, y: -0.17, z: -1.9 },
  sillOffsetX: 0.857,
}

// Dominus-inspired: a long low bonnet, a wide flat roof set well back, and a
// body that sits down on its wheels.
const muscle: BodySpec = {
  bodyHalf: 0.865,
  bevelT: 0.08,
  bevelS: 0.036,
  sillY: -0.34,
  archR: 0.42,

  zNose: 2.1,
  noseBotY: -0.185,
  noseTopZ: 2.06,
  noseTopY: 0.115,
  top: [
    v2(1.95, 0.19),
    v2(1.7, 0.225),
    v2(1.2, 0.262),
    v2(0.6, 0.288), //   an enormous bonnet, and the cowl is behind the middle
    v2(0.0, 0.3),
    v2(-0.6, 0.318),
    v2(-1.15, 0.335),
    v2(-1.55, 0.328),
    v2(-1.8, 0.318),
    v2(-1.86, 0.346), // ducktail
    v2(-1.9, 0.33),
  ],
  zTail: -1.9,
  tailBotY: -0.1,
  rearValance: [v2(-1.85, -0.27)],
  frontValance: [v2(2.03, -0.29)],

  swage: { y: 0.06, z: 0.0, len: 3.4, rx: 0 },

  glassHalf: 0.8,
  roofHalf: 0.845,
  glass: [v2(0.55, 0.27), v2(-0.15, 0.5), v2(-0.65, 0.525), v2(-1.05, 0.518), v2(-1.62, 0.315)],
  roof: [
    v2(-1.05, 0.462),
    v2(-0.65, 0.47),
    v2(-0.15, 0.445),
    v2(-0.15, 0.5),
    v2(-0.65, 0.525),
    v2(-1.05, 0.518),
  ],
  pillars: [
    { z0: 0.53, y0: 0.285, z1: -0.12, y1: 0.485, thick: 0.07, width: 0.06, x: 0.826 },
    { z0: -1.07, y0: 0.505, z1: -1.6, y1: 0.328, thick: 0.09, width: 0.11, x: 0.822 },
  ],
  mirror: { x: 0.895, y: 0.335, z: 0.42 },

  grille: { w: 1.52, h: 0.16, d: 0.03, x: 0, y: -0.05, z: 2.098, rx: -0.131 },
  intake: { w: 1.1, h: 0.07, d: 0.03, x: 0, y: -0.165, z: 2.086, rx: -0.131 },
  headlight: { w: 0.36, h: 0.06, d: 0.02, x: 0.5, y: 0.055, z: 2.09, rx: -0.131 },
  headlightStrip: { w: 0.24, h: 0.016, d: 0.018, x: 0.53, y: -0.11, z: 2.082, rx: -0.131 },

  tailPanel: { w: 1.52, h: 0.2, d: 0.03, x: 0, y: 0.16, z: -1.913 },
  tailBar: { w: 1.42, h: 0.045, d: 0.025, x: 0, y: 0.19, z: -1.922 },
  tailPod: { w: 0.3, h: 0.08, d: 0.025, x: 0.52, y: 0.19, z: -1.922 },
  reverse: { w: 0.14, h: 0.04, d: 0.02, x: 0.32, y: 0.08, z: -1.92 },

  splitter: { w: 1.56, h: 0.045, d: 0.3, x: 0, y: -0.322, z: 1.86 },
  diffuser: { w: 1.16, h: 0.14, d: 0.28, x: 0, y: -0.235, z: -1.8 },
  exhaust: { x: 0.36, y: -0.18, z: -1.92 },
  sillOffsetX: 0.852,
}

// Breakout-inspired: one straight rising line from a pointed nose to a high
// tail, a canopy sunk into it, and every edge left sharp.
const wedge: BodySpec = {
  bodyHalf: 0.85,
  bevelT: 0.07,
  bevelS: 0.03,
  sillY: -0.33,
  archR: 0.42,

  zNose: 2.12,
  noseBotY: -0.26,
  noseTopZ: 2.06,
  noseTopY: -0.13, //   barely a face at all: the nose is a point
  top: [
    v2(1.85, -0.02),
    v2(1.4, 0.1),
    v2(0.9, 0.205),
    v2(0.35, 0.3),
    v2(-0.25, 0.375),
    v2(-0.85, 0.425),
    v2(-1.35, 0.455),
    v2(-1.7, 0.462),
    v2(-1.86, 0.482), // ducktail
    v2(-1.9, 0.458),
  ],
  zTail: -1.9,
  tailBotY: -0.1,
  rearValance: [v2(-1.86, -0.27)],
  frontValance: [v2(2.02, -0.31)],

  // the crease is raked to run parallel with the wedge, 10 cm under its edge
  swage: { y: 0.18, z: 0.0, len: 3.1, rx: 0.129 },

  glassHalf: 0.685,
  roofHalf: 0.72,
  glass: [v2(0.75, 0.2), v2(0.2, 0.415), v2(-0.3, 0.5), v2(-0.8, 0.495), v2(-1.3, 0.36)],
  roof: [
    v2(-0.8, 0.44),
    v2(-0.3, 0.447),
    v2(0.2, 0.362),
    v2(0.2, 0.415),
    v2(-0.3, 0.5),
    v2(-0.8, 0.495),
  ],
  pillars: [
    { z0: 0.73, y0: 0.215, z1: 0.23, y1: 0.4, thick: 0.06, width: 0.05, x: 0.706 },
    { z0: -0.82, y0: 0.48, z1: -1.28, y1: 0.375, thick: 0.07, width: 0.085, x: 0.702 },
  ],
  mirror: { x: 0.86, y: 0.245, z: 0.62 },

  grille: { w: 1.2, h: 0.09, d: 0.03, x: 0, y: -0.19, z: 2.11, rx: -0.43 },
  headlight: { w: 0.3, h: 0.032, d: 0.02, x: 0.42, y: -0.07, z: 2.03, rx: -0.43 },

  tailPanel: { w: 1.44, h: 0.3, d: 0.03, x: 0, y: 0.19, z: -1.913 },
  tailBar: { w: 1.3, h: 0.045, d: 0.025, x: 0, y: 0.3, z: -1.922 },
  tailPod: { w: 0.26, h: 0.075, d: 0.025, x: 0.5, y: 0.3, z: -1.922 },
  reverse: { w: 0.13, h: 0.04, d: 0.02, x: 0.3, y: 0.09, z: -1.92 },

  splitter: { w: 1.44, h: 0.04, d: 0.32, x: 0, y: -0.318, z: 1.86 },
  diffuser: { w: 1.1, h: 0.14, d: 0.26, x: 0, y: -0.225, z: -1.81 },
  exhaust: { x: 0.3, y: -0.175, z: -1.93 },
  sillOffsetX: 0.837,
}

export const BODY_SPECS: Record<CarBodyId, BodySpec> = { coupe, striker, muscle, wedge }
