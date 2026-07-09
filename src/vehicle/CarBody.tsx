// ============================================================
//  CAR BODY - the Sundown GT
// ------------------------------------------------------------
//  THE SWAP CONTRACT (read this before re-skinning the car)
//
//  This component draws the car and NOTHING else. It runs no
//  physics, reads no input, and owns no state. It is handed the
//  car's pose by its parent and its articulation by `carVisual`
//  (src/vehicle/carVisual.ts). To replace the meshes with a real
//  model, keep the four rules below and touch nothing in
//  useVehiclePhysics.ts.
//
//  1. SPACE. Everything here is drawn in CHASSIS-LOCAL space.
//     The rigid body's world pose is already applied by the
//     parent group. The origin sits on the centre line, 0.54 m
//     above the road at rest (0.20 m above the wheel hubs).
//     So local y = -0.542 IS the road surface at rest.
//     +Z forward, +Y up, +X is the car's LEFT.
//
//  2. THE SPRUNG BODY vs THE WHEELS. `bodyRef` holds everything
//     that leans - shell, glass, lights, wings. The wheels hang
//     OUTSIDE it. carVisual.roll / .pitch / .bodyOffsetY move only
//     the body. That separation is what reads as suspension.
//       rotation.z = +roll   (positive = leaning right)
//       rotation.x = -pitch  (positive pitch = nose up)
//
//  3. THE WHEELS. carVisual.wheels is [FL, FR, RL, RR]. Each gives
//     a chassis-local `position` (suspension travel already baked
//     in), a `steer` yaw, a `spin` angle about the axle (+X), a
//     0..1 `compression`, and a `contact` flag. The node layout is
//     steer group -> spin group -> mesh, so a swapped-in wheel mesh
//     only has to sit at the origin with its axle along X.
//
//  4. SYNC. `sync()` is called by Vehicle ONCE per rendered frame,
//     after the physics has written carVisual and before three
//     renders. Do all mesh updates there. Do not add a useFrame -
//     a child's useFrame runs BEFORE its parent's, which would put
//     the wheels one frame behind the car.
//
//  Nothing here allocates per frame.
//
// ------------------------------------------------------------
//  HOW THE SHELL IS BUILT
//
//  No model file, no box stack. The body is a LOFT: 56 cross
//  sections strung along the car's length, each one a superellipse
//  (a rounded rectangle, mathematically) whose half-width varies
//  with height. Vary the roofline, the sill, the shoulder width
//  and the width-at-the-top along the length, and a coupe falls
//  out: wide haunches, a narrow greenhouse leaning in over them
//  (tumblehome), a raked screen, a fastback tail.
//
//  Two tricks do most of the work:
//
//    - WHEEL ARCHES. Where the shell passes over an axle it is
//      pushed out to clear the tyre (`archInflate`). That bulge,
//      blended over ~0.5 m of length, IS the haunch.
//
//    - ONE MESH, THREE MATERIALS. Paint, glass and dark trim are
//      material groups on a single geometry, selected per quad by
//      where the quad sits. The glass therefore follows the body's
//      curvature exactly - no separate windscreen to line up, no
//      gap at the A-pillar. The roof panel is carved back out of
//      the glass by z-range, which is what gives the floating-roof
//      look.
//
//  ~4.5k triangles, 3 draw calls for the shell. Built once.
// ============================================================

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CONFIG } from '../core/config'
import { carVisual } from './carVisual'
import type { CarBodyHandle } from './carVisual'
import { WHEEL } from './tuning'

// ---------- palette ----------

const GLASS_COLOUR = '#0A1119'
const TRIM_COLOUR = '#26282B'
const TYRE_COLOUR = '#1E1D22'
const RIM_COLOUR = '#CFC8B6'
const HEADLIGHT_COLOUR = '#FFF4DC'
const TAIL_COLOUR = '#FF2A16'

// ---------- proportions ----------

const ROAD_Y = -0.542 //          the road, at rest, in chassis-local space
const HUB_Y = -0.2 //             wheel centre at rest
const WHEEL_WIDTH = 0.26
/** Outer face of a tyre, chassis-local: 0.93 m. The car's true widest point. */
const WHEEL_OUTER = WHEEL.halfTrack + WHEEL_WIDTH / 2

/**
 * How far out the shell is pushed over an axle, as a function of height.
 *
 * This is the single most important number on the car, and it took a magenta
 * debug tyre to find out why. A fender that is WIDER than its tyre hides that
 * tyre completely from a chase camera looking down at ~22 degrees - the lip
 * occludes everything beneath it, and the car appears to hover. So:
 *
 *   - at the top of the tread the shell reaches PAST the tyre (0.935 vs
 *     WHEEL_OUTER = 0.93) and covers it, as a wing must;
 *   - below the tyre's widest point it tucks back INSIDE (0.905), leaving the
 *     tyre standing 2.5 cm proud.
 *
 * The tyres, not the bodywork, now set the car's widest point. That is true of
 * every real sports coupe, and it is why you can see its wheels.
 */
function archClearAt(y: number): number {
  const tucked = WHEEL_OUTER - 0.025
  const covering = WHEEL_OUTER + 0.005
  return tucked + (covering - tucked) * smoothstep(-0.1, 0.13, y)
}

const Z_TAIL = -2.2
const Z_NOSE = 2.18

const STATIONS = 56
const RING = 40

/** Superellipse exponent. 2 = ellipse, higher = rounded rectangle. */
const SECTION_P = 3.3
/** Fraction of section height at which the body is widest (the shoulder line). */
const SHOULDER_V = 0.42

// Roofline, floor, shoulder half-width, and half-width at the very top,
// as keyframes along z. Everything about the car's character is in this table.
type Key = readonly [number, number]

const Y_TOP: Key[] = [
  [-2.2, 0.14],
  [-2.16, 0.17],
  [-2.02, 0.245],
  [-1.86, 0.245],
  [-1.62, 0.3],
  [-1.3, 0.44],
  [-0.96, 0.585],
  [-0.72, 0.645],
  [-0.3, 0.662],
  [0.1, 0.648],
  [0.34, 0.6],
  [0.62, 0.47],
  [0.9, 0.33],
  [1.06, 0.255],
  [1.34, 0.225],
  [1.7, 0.205],
  [1.94, 0.15],
  [2.08, 0.05],
  [2.18, -0.06],
]

const Y_BOT: Key[] = [
  [-2.2, -0.2],
  [-2.16, -0.23],
  [-1.98, -0.3],
  [-1.6, -0.33],
  [0.0, -0.335],
  [1.6, -0.33],
  [1.98, -0.3],
  [2.1, -0.27],
  [2.18, -0.2],
]

// Nothing in this table may exceed WHEEL_OUTER, or the bodywork starts hiding
// the wheels again. The car is 1.81 m across its paint and 1.86 m across its tyres.
const HALF_SHOULDER: Key[] = [
  [-2.2, 0.66],
  [-2.16, 0.82],
  [-2.02, 0.862],
  [-1.75, 0.898],
  [-1.42, 0.905],
  [-1.05, 0.878],
  [-0.3, 0.862],
  [0.35, 0.878],
  [1.05, 0.892],
  [1.42, 0.905],
  [1.78, 0.882],
  [2.02, 0.8],
  [2.11, 0.63],
  [2.18, 0.29],
]

const HALF_TOP: Key[] = [
  [-2.2, 0.52],
  [-2.0, 0.72],
  [-1.7, 0.74],
  [-1.35, 0.66],
  [-1.0, 0.6],
  [-0.3, 0.585],
  [0.3, 0.6],
  [0.75, 0.66],
  [1.05, 0.72],
  [1.45, 0.8],
  [1.8, 0.76],
  [2.02, 0.6],
  [2.18, 0.26],
]

// glass extents, in z
const GLASS_Z_BACK = -1.66
const GLASS_Z_FRONT = 1.02
const ROOF_Z_BACK = -1.1
const ROOF_Z_FRONT = 0.3
/** No glass below this height - stops the waistline creeping down the fenders. */
const GLASS_Y_MIN = 0.19

const MAT_PAINT = 0
const MAT_GLASS = 1
const MAT_TRIM = 2

// ---------- maths ----------

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Keyframed profile with smoothstep between keys. */
function keyed(keys: Key[], z: number): number {
  if (z <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    if (z <= keys[i][0]) {
      const t = (z - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])
      const s = t * t * (3 - 2 * t)
      return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * s
    }
  }
  return keys[keys.length - 1][1]
}

/** Smoothstep between keys leaves a flat spot AT each key. Blur it away. */
function relax(a: Float64Array, passes: number): void {
  const n = a.length
  const tmp = new Float64Array(n)
  for (let p = 0; p < passes; p++) {
    tmp[0] = a[0]
    tmp[n - 1] = a[n - 1]
    for (let i = 1; i < n - 1; i++) tmp[i] = a[i - 1] * 0.25 + a[i] * 0.5 + a[i + 1] * 0.25
    a.set(tmp)
  }
}

/** How strongly this z sits over an axle. 1 on the axle, 0 by ~0.8 m away. */
function archAmount(z: number): number {
  const f = Math.exp(-Math.pow((z - WHEEL.halfBase) / 0.46, 2))
  const r = Math.exp(-Math.pow((z + WHEEL.halfBase) / 0.46, 2))
  return Math.min(1, f + r)
}

/**
 * The arch OPENING: how far the shell's underside lifts over an axle. Without
 * this the closed shell simply wraps the tyres and the car reads as a bar of
 * soap on castors. Lifting the floor line to just above the hub exposes the
 * bottom half of each wheel - which is exactly how much of a wheel a car shows.
 */
const ARCH_LIFT = 0.155

/** Above the tread there is no tyre, so the fender lip can start rolling back in. */
function archCoverY(y: number): number {
  return 1 - smoothstep(HUB_Y + WHEEL.radius, HUB_Y + WHEEL.radius + 0.16, y)
}

// ---------- the shell ----------

interface Section {
  z: number
  yTop: number
  yBot: number
  shoulder: number
  top: number
}

function buildSections(): Section[] {
  const z = new Float64Array(STATIONS)
  const yTop = new Float64Array(STATIONS)
  const yBot = new Float64Array(STATIONS)
  const shoulder = new Float64Array(STATIONS)
  const top = new Float64Array(STATIONS)

  for (let i = 0; i < STATIONS; i++) {
    const zi = Z_TAIL + ((Z_NOSE - Z_TAIL) * i) / (STATIONS - 1)
    z[i] = zi
    yTop[i] = keyed(Y_TOP, zi)
    yBot[i] = keyed(Y_BOT, zi) + archAmount(zi) * ARCH_LIFT
    shoulder[i] = keyed(HALF_SHOULDER, zi)
    top[i] = keyed(HALF_TOP, zi)
  }
  relax(yTop, 2)
  relax(yBot, 2)
  relax(shoulder, 2)
  relax(top, 2)

  const out: Section[] = []
  for (let i = 0; i < STATIONS; i++) {
    out.push({ z: z[i], yTop: yTop[i], yBot: yBot[i], shoulder: shoulder[i], top: top[i] })
  }
  return out
}

/** Half-width of a section at normalised height v, before the wheel arch. */
function halfWidthAt(s: Section, v: number): number {
  const sill = s.shoulder - 0.085
  if (v < SHOULDER_V) return sill + (s.shoulder - sill) * smoothstep(0, SHOULDER_V, v)
  const t = Math.pow(smoothstep(SHOULDER_V, 1, v), 1.25)
  return s.shoulder + (s.top - s.shoulder) * t
}

function buildShell(): THREE.BufferGeometry {
  const sections = buildSections()
  const nose = sections[STATIONS - 1]
  const tail = sections[0]

  const vertCount = STATIONS * RING + 2 * (RING + 1) // + two cap fans (ring copy + centre)
  const positions = new Float32Array(vertCount * 3)
  // per-vertex metadata used only to classify quads into material groups
  const vAt = new Float64Array(STATIONS * RING)
  const uAt = new Float64Array(STATIONS * RING)

  const invP = 2 / SECTION_P
  let p = 0

  for (let i = 0; i < STATIONS; i++) {
    const s = sections[i]
    const arch = archAmount(s.z)

    for (let j = 0; j < RING; j++) {
      const a = (Math.PI * 2 * j) / RING
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const u = Math.sign(ca) * Math.pow(Math.abs(ca), invP)
      const w = Math.sign(sa) * Math.pow(Math.abs(sa), invP)
      const v = (w + 1) * 0.5

      const y = s.yBot + (s.yTop - s.yBot) * v
      let x = u * halfWidthAt(s, v)

      if (arch > 0) {
        const k = arch * archCoverY(y) * smoothstep(0.4, 0.92, Math.abs(u))
        if (k > 0) {
          const mag = Math.abs(x)
          x = Math.sign(x || 1) * (mag + k * Math.max(0, archClearAt(y) - mag))
        }
      }

      const idx = i * RING + j
      vAt[idx] = v
      uAt[idx] = u
      positions[p++] = x
      positions[p++] = y
      positions[p++] = s.z
    }
  }

  // Cap fans get their OWN vertices so computeVertexNormals leaves a crease at
  // the rim of the tail panel instead of rounding it off.
  const tailCapStart = STATIONS * RING
  const noseCapStart = tailCapStart + RING + 1
  for (let j = 0; j < RING; j++) {
    positions[(tailCapStart + j) * 3] = positions[j * 3]
    positions[(tailCapStart + j) * 3 + 1] = positions[j * 3 + 1]
    positions[(tailCapStart + j) * 3 + 2] = positions[j * 3 + 2]
    const src = (STATIONS - 1) * RING + j
    positions[(noseCapStart + j) * 3] = positions[src * 3]
    positions[(noseCapStart + j) * 3 + 1] = positions[src * 3 + 1]
    positions[(noseCapStart + j) * 3 + 2] = positions[src * 3 + 2]
  }
  const tailCentre = tailCapStart + RING
  const noseCentre = noseCapStart + RING
  positions[tailCentre * 3] = 0
  positions[tailCentre * 3 + 1] = (tail.yTop + tail.yBot) * 0.5
  positions[tailCentre * 3 + 2] = tail.z
  positions[noseCentre * 3] = 0
  positions[noseCentre * 3 + 1] = (nose.yTop + nose.yBot) * 0.5
  positions[noseCentre * 3 + 2] = nose.z

  // ---------- classify quads, then emit indices grouped by material ----------
  const paint: number[] = []
  const glass: number[] = []
  const trim: number[] = []

  for (let i = 0; i < STATIONS - 1; i++) {
    const zMean = (sections[i].z + sections[i + 1].z) * 0.5
    for (let j = 0; j < RING; j++) {
      const j2 = (j + 1) % RING
      const a = i * RING + j
      const b = i * RING + j2
      const c = (i + 1) * RING + j
      const d = (i + 1) * RING + j2

      const vMean = (vAt[a] + vAt[b] + vAt[c] + vAt[d]) * 0.25
      const yMean = (positions[a * 3 + 1] + positions[d * 3 + 1]) * 0.5

      let target = paint
      if (yMean < -0.245) {
        // The tuck-under: sills, floor pan, valances. Keyed off absolute height,
        // not v, so the lifted floor over each axle stays painted - the lip of a
        // wheel arch is body colour, the rocker beside it is not.
        target = trim
      } else if (
        vMean > 0.52 &&
        yMean > GLASS_Y_MIN &&
        zMean > GLASS_Z_BACK &&
        zMean < GLASS_Z_FRONT &&
        !(vMean > 0.9 && zMean > ROOF_Z_BACK && zMean < ROOF_Z_FRONT)
      ) {
        target = glass
      }
      // wound so the face normal points out of the shell, not into the cabin
      target.push(a, b, c, b, d, c)
    }
  }

  for (let j = 0; j < RING; j++) {
    const j2 = (j + 1) % RING
    paint.push(tailCapStart + j2, tailCapStart + j, tailCentre)
    paint.push(noseCapStart + j, noseCapStart + j2, noseCentre)
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setIndex([...paint, ...glass, ...trim])
  geom.addGroup(0, paint.length, MAT_PAINT)
  geom.addGroup(paint.length, glass.length, MAT_GLASS)
  geom.addGroup(paint.length + glass.length, trim.length, MAT_TRIM)
  geom.computeVertexNormals()
  geom.computeBoundingSphere()
  return geom
}

// ---------- detail geometry ----------

function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rx !== 0) g.rotateX(rx)
  g.translate(x, y, z)
  return g
}

/** Splitter, diffuser, skirts, mirror stalks, exhausts - one dark mesh. */
function buildTrimDetails(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    box(1.54, 0.05, 0.34, 0, -0.318, 1.86), //         front splitter
    box(1.3, 0.16, 0.3, 0, -0.245, -2.0), //           rear diffuser
    box(1.44, 0.13, 0.02, 0, 0.06, -2.168), //         bezel behind the light bar
    box(0.11, 0.1, 2.0, 0.82, -0.315, -0.06), //       left skirt
    box(0.11, 0.1, 2.0, -0.82, -0.315, -0.06), //      right skirt
    box(0.1, 0.035, 0.11, 0.77, 0.315, 0.62), //       left mirror stalk
    box(0.1, 0.035, 0.11, -0.77, 0.315, 0.62), //      right mirror stalk
  ]
  for (const x of [0.36, -0.36]) {
    const pipe = new THREE.CylinderGeometry(0.052, 0.052, 0.13, 12)
    pipe.rotateX(Math.PI / 2)
    pipe.translate(x, -0.225, -2.19)
    parts.push(pipe)
  }
  return mergeGeometries(parts, false)!
}

/** Mirror pods, painted. */
function buildMirrors(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const x of [0.93, -0.93]) {
    const pod = new THREE.SphereGeometry(0.5, 12, 8)
    pod.scale(0.13, 0.075, 0.1)
    pod.translate(x * 0.94, 0.325, 0.6)
    parts.push(pod)
  }
  return mergeGeometries(parts, false)!
}

/** Ducktail lip, painted. Reads on the silhouette from behind. */
function buildSpoiler(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1.44, 0.042, 0.26)
  g.rotateX(-0.13)
  g.translate(0, 0.278, -1.99)
  return g
}

function buildHeadlights(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const x of [0.53, -0.53]) {
    const lens = new THREE.SphereGeometry(0.5, 14, 10)
    lens.scale(0.46, 0.15, 0.3)
    lens.translate(x, -0.015, 1.9)
    parts.push(lens)
    parts.push(box(0.4, 0.028, 0.06, x * 1.02, -0.115, 2.0))
  }
  return mergeGeometries(parts, false)!
}

/** Full-width bar plus two pods. The whole thing rides carVisual.brake. */
function buildTaillights(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [box(1.32, 0.04, 0.045, 0, 0.06, -2.183)]
  for (const x of [0.5, -0.5]) parts.push(box(0.34, 0.078, 0.045, x, 0.06, -2.183))
  return mergeGeometries(parts, false)!
}

function buildReverseLights(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const x of [0.3, -0.3]) parts.push(box(0.16, 0.05, 0.04, x, -0.09, -2.175))
  return mergeGeometries(parts, false)!
}

// ---------- wheels ----------

/** Lathed tyre: real sidewalls, rounded shoulders, flat tread. Axle along X. */
function buildTyre(): THREE.BufferGeometry {
  const r = WHEEL.radius
  const hw = WHEEL_WIDTH / 2
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.19, -hw),
    new THREE.Vector2(0.255, -hw - 0.006),
    new THREE.Vector2(0.3, -hw + 0.004),
    new THREE.Vector2(r - 0.028, -hw + 0.03),
    new THREE.Vector2(r, -hw + 0.07),
    new THREE.Vector2(r, hw - 0.07),
    new THREE.Vector2(r - 0.028, hw - 0.03),
    new THREE.Vector2(0.3, hw - 0.004),
    new THREE.Vector2(0.255, hw + 0.006),
    new THREE.Vector2(0.19, hw),
  ]
  const g = new THREE.LatheGeometry(profile, 24)
  g.rotateZ(Math.PI / 2)
  return g
}

/** Barrel + face + five spokes + centre cap, merged. Spokes make the spin read. */
function buildRim(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const hw = WHEEL_WIDTH / 2

  const barrel = new THREE.CylinderGeometry(0.222, 0.222, WHEEL_WIDTH * 0.9, 20, 1, true)
  barrel.rotateZ(Math.PI / 2)
  parts.push(barrel)

  // The face sits almost flush with the tyre's outer sidewall. Set it deeper and
  // the sidewall hides the spokes at every angle except dead side-on, which is
  // the one angle a chase camera never has.
  const face = new THREE.CylinderGeometry(0.238, 0.238, 0.026, 22)
  face.rotateZ(Math.PI / 2)
  face.translate(hw - 0.016, 0, 0)
  parts.push(face)

  // Five spokes. The spin has to be legible or the wheels look welded on.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const spoke = new THREE.BoxGeometry(0.042, 0.13, 0.056)
    spoke.translate(0, 0.155, 0)
    spoke.rotateX(a)
    spoke.translate(hw - 0.02, 0, 0)
    parts.push(spoke)
  }

  const cap = new THREE.CylinderGeometry(0.058, 0.052, 0.03, 12)
  cap.rotateZ(Math.PI / 2)
  cap.translate(hw + 0.002, 0, 0)
  parts.push(cap)

  return mergeGeometries(parts, false)!
}

/** Brake disc, glimpsed between the spokes. */
function buildDisc(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.205, 0.205, 0.022, 18)
  g.rotateZ(Math.PI / 2)
  g.translate(WHEEL_WIDTH / 2 - 0.072, 0, 0)
  return g
}

// ---------- the soft shadow the car sits in ----------

/**
 * A radial-gradient quad, 6 mm off the road. Contact shadows in three cost a
 * render target and a blur; this costs one texture fetch and does the same job
 * at chase-camera distance - it stops the car looking pasted onto the tarmac.
 */
function buildUnderShadowTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(16,10,7,0.66)')
  g.addColorStop(0.42, 'rgba(16,10,7,0.42)')
  g.addColorStop(0.76, 'rgba(16,10,7,0.11)')
  g.addColorStop(1, 'rgba(16,10,7,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ============================================================

export const CarBody = forwardRef<CarBodyHandle>(function CarBody(_props, ref) {
  const bodyRef = useRef<THREE.Group>(null)
  const steerRefs = useRef<(THREE.Group | null)[]>([null, null, null, null])
  const spinRefs = useRef<(THREE.Group | null)[]>([null, null, null, null])
  const tailMat = useRef<THREE.MeshStandardMaterial>(null)
  const reverseMat = useRef<THREE.MeshStandardMaterial>(null)
  const shadowRef = useRef<THREE.Mesh>(null)

  const geom = useMemo(
    () => ({
      shell: buildShell(),
      trim: buildTrimDetails(),
      mirrors: buildMirrors(),
      spoiler: buildSpoiler(),
      head: buildHeadlights(),
      tail: buildTaillights(),
      reverse: buildReverseLights(),
      tyre: buildTyre(),
      rim: buildRim(),
      disc: buildDisc(),
    }),
    []
  )
  const shadowTex = useMemo(() => buildUnderShadowTexture(), [])

  useEffect(() => {
    const built = geom
    const tex = shadowTex
    return () => {
      for (const g of Object.values(built)) g.dispose()
      tex.dispose()
    }
  }, [geom, shadowTex])

  useImperativeHandle(
    ref,
    (): CarBodyHandle => ({
      sync() {
        const body = bodyRef.current
        if (body) {
          body.rotation.z = carVisual.roll
          body.rotation.x = -carVisual.pitch
          body.position.y = carVisual.bodyOffsetY
        }
        let hubSum = 0
        for (let i = 0; i < 4; i++) {
          const w = carVisual.wheels[i]
          const steer = steerRefs.current[i]
          const spin = spinRefs.current[i]
          if (steer) {
            steer.position.copy(w.position)
            steer.rotation.y = w.steer
          }
          if (spin) spin.rotation.x = w.spin
          hubSum += w.position.y
        }
        // The road is wherever the tyres are. Riding the mean hub height keeps
        // the blob welded to the asphalt through squat, dive and every bump.
        const shadow = shadowRef.current
        if (shadow) shadow.position.y = hubSum * 0.25 - WHEEL.radius + 0.006
        // Tail lights idle at a dim glow and go incandescent on the brakes.
        // Above 1.0 they cross the bloom threshold, which is what makes braking
        // at dusk feel like braking at dusk.
        if (tailMat.current) tailMat.current.emissiveIntensity = 0.32 + carVisual.brake * 3.4
        if (reverseMat.current) reverseMat.current.emissiveIntensity = carVisual.reversing ? 2.2 : 0
      },
    }),
    []
  )

  return (
    <group>
      {/* ---------- sprung body: leans, pitches, squats ---------- */}
      <group ref={bodyRef}>
        <mesh geometry={geom.shell} castShadow receiveShadow>
          {/* paint. Clearcoat over metallic base: the environment map gives it a
              sky to mirror, and the two-lobe specular is what says "car paint"
              rather than "shiny plastic". */}
          <meshPhysicalMaterial
            attach="material-0"
            color={CONFIG.carColor}
            roughness={0.26}
            metalness={0.42}
            clearcoat={1}
            clearcoatRoughness={0.06}
            envMapIntensity={1.15}
          />
          {/* glass - opaque, but near-mirror and dark. Transmission would cost a
              second render of the scene for a cabin nobody can see into.
              Roughness is deliberately off zero: a perfect mirror reflects the
              environment's sun disc at full strength and bloom turns it into a
              welding arc on the windscreen. */}
          <meshStandardMaterial
            attach="material-1"
            color={GLASS_COLOUR}
            roughness={0.12}
            metalness={0.9}
            envMapIntensity={1.15}
          />
          <meshStandardMaterial
            attach="material-2"
            color={TRIM_COLOUR}
            roughness={0.62}
            metalness={0.18}
          />
        </mesh>

        <mesh geometry={geom.spoiler} castShadow>
          <meshPhysicalMaterial
            color={CONFIG.carColor}
            roughness={0.26}
            metalness={0.42}
            clearcoat={1}
            clearcoatRoughness={0.06}
            envMapIntensity={1.15}
          />
        </mesh>

        <mesh geometry={geom.mirrors} castShadow>
          <meshPhysicalMaterial
            color={CONFIG.carColor}
            roughness={0.26}
            metalness={0.42}
            clearcoat={1}
            envMapIntensity={1.15}
          />
        </mesh>

        <mesh geometry={geom.trim} castShadow>
          <meshStandardMaterial color={TRIM_COLOUR} roughness={0.62} metalness={0.18} />
        </mesh>

        <mesh geometry={geom.head}>
          <meshStandardMaterial
            color={HEADLIGHT_COLOUR}
            emissive={HEADLIGHT_COLOUR}
            emissiveIntensity={1.35}
            roughness={0.16}
            metalness={0.1}
          />
        </mesh>

        <mesh geometry={geom.tail}>
          <meshStandardMaterial
            ref={tailMat}
            color="#4E0D07"
            emissive={TAIL_COLOUR}
            emissiveIntensity={0.32}
            roughness={0.28}
          />
        </mesh>

        <mesh geometry={geom.reverse}>
          <meshStandardMaterial
            ref={reverseMat}
            color="#D8D2C4"
            emissive="#FFF6E4"
            emissiveIntensity={0}
            roughness={0.3}
          />
        </mesh>
      </group>

      {/* Unsprung, so it stays parallel to the road instead of leaning with the
          body. 6 mm of clearance is enough to never z-fight the asphalt. */}
      <mesh
        ref={shadowRef}
        position={[0, ROAD_Y + 0.006, -0.05]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      >
        <planeGeometry args={[2.45, 4.8]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} opacity={0.7} />
      </mesh>

      {/* ---------- unsprung: wheels ride the suspension ---------- */}
      {carVisual.wheels.map((w, i) => (
        <group
          key={i}
          ref={(g) => {
            steerRefs.current[i] = g
          }}
          position={w.position}
        >
          <group
            ref={(g) => {
              spinRefs.current[i] = g
            }}
            // Mirror the right-hand pair across X so the dished rim face and the
            // brake disc end up outboard on both sides. Rotation about X commutes
            // with an X mirror, so the spin direction is untouched.
            scale={[i % 2 === 0 ? 1 : -1, 1, 1]}
          >
            <mesh geometry={geom.tyre} castShadow receiveShadow>
              <meshStandardMaterial
                color={TYRE_COLOUR}
                roughness={0.88}
                metalness={0}
                envMapIntensity={0.9}
              />
            </mesh>
            <mesh geometry={geom.disc}>
              <meshStandardMaterial color="#3A3A3C" roughness={0.4} metalness={0.85} />
            </mesh>
            <mesh geometry={geom.rim} castShadow>
              <meshStandardMaterial
                color={RIM_COLOUR}
                roughness={0.33}
                metalness={0.55}
                envMapIntensity={1.3}
              />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
})
