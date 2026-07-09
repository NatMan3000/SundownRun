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
//  HOW THE BODY IS BUILT - surfaces, edges, no balloons
//
//  The mass is ONE 2D side profile (a THREE.Shape in the z/y
//  plane) extruded across the car's width. The profile carries the
//  whole design: a low bonnet falling to the nose, a beltline
//  rising toward the rear, a Kamm tail chopped near-vertical, and
//  the two wheel arches cut into it as clean 24-segment arcs.
//
//  The extrusion takes a SMALL bevel - 7.5 cm of chamfer, two
//  segments. That single number is why the car reads as panels
//  rather than as a balloon: every silhouette edge becomes a crisp
//  chamfer with its own highlight instead of a fat radius. A loft
//  of smoothly-varying cross sections cannot do this; it can only
//  inflate, which is exactly how the last body went wrong.
//
//  Nothing wraps over a tyre. The body's flank is 0.855 m out; a
//  tyre's outer face is 0.9425 m out, so the wheels stand PROUD of
//  the paint and each arch opening clears the tread by 8 cm. You
//  can always see the whole wheel.
//
//  The greenhouse is a separate, narrower volume: a dark glass core
//  with a painted roof band and painted A- and C-pillars sitting
//  proud of it, so the side glass reads as an inset panel inside a
//  frame - not as a black wrap over the top of the car.
//
//  Feature lines: a swage crease down each flank, a dark sill strip
//  flush to the underside, an inset grille band with the headlights
//  living in it, and a vertical tail panel carrying the light bar.
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
const TRIM_COLOUR = '#24262A'
const DARK_TRIM_COLOUR = '#15171B'
const TYRE_COLOUR = '#1E1D22'
const RIM_COLOUR = '#3B3F45'
const RIM_LIP_COLOUR = '#D9D2C1'
const HEADLIGHT_COLOUR = '#FFF4DC'
const TAIL_COLOUR = '#FF2A16'

// ---------- proportions ----------

const ROAD_Y = -0.542 //   the road, at rest, in chassis-local space
const HUB_Y = -0.2 //      wheel centre at rest

/** Visual tyre radius. WHEEL.radius (0.34) is the physics ray length; the extra
 *  centimetre is the contact patch a real tyre flattens into the road. */
const VIS_RADIUS = 0.35
const WHEEL_WIDTH = 0.285
/** Outer face of a tyre: 0.9425 m. The car's true widest point, by design. */
const WHEEL_OUTER = WHEEL.halfTrack + WHEEL_WIDTH / 2
/** The blob under the car spans the TRACK, not the paint - the wheels are wider. */
const SHADOW_WIDTH = WHEEL_OUTER * 2 + 0.35

/** Half-width of the painted mass. Inboard of the tyres, so no wing can ever
 *  swallow a wheel. */
const BODY_HALF = 0.855
/** The chamfer. Small and hard: this is what makes an edge an edge. */
const BEVEL_T = 0.075
const BEVEL_S = 0.034

const Z_NOSE = 2.02
const Z_TAIL = -1.95
const SILL_Y = -0.32
/** Arch opening radius. Tyre plus 8 cm of air, all the way round. */
const ARCH_R = VIS_RADIUS + 0.08

// greenhouse
const GLASS_HALF = 0.79
const ROOF_HALF = 0.822
const Z_COWL = 0.98
const Z_SCREEN_TOP = 0.22
const Z_ROOF_REAR = -0.86
const Z_BACKLIGHT_BASE = -1.45

// ---------- helpers ----------

function v2(x: number, y: number): THREE.Vector2 {
  return new THREE.Vector2(x, y)
}

/**
 * Cut a wheel arch into the profile's underside: a clean circular arc from the
 * sill, up over the hub, and back down to the sill. Sampled at 24 segments,
 * which is enough that the rim reads as a curve and not as a polygon.
 */
function archArc(pts: THREE.Vector2[], cz: number, r: number): void {
  const dy = SILL_Y - HUB_Y
  const dz = Math.sqrt(r * r - dy * dy)
  const enter = Math.atan2(dy, -dz) + Math.PI * 2
  const exit = Math.atan2(dy, dz)
  const N = 24
  for (let i = 0; i <= N; i++) {
    const a = enter + (exit - enter) * (i / N)
    pts.push(v2(cz + r * Math.cos(a), HUB_Y + r * Math.sin(a)))
  }
}

/**
 * Extrude a z/y side profile across the car's width, chamfered at both flanks.
 *
 * bevelOffset = -bevelSize is not decoration. With the default 0, three GROWS
 * the outline by bevelSize through the middle of the extrusion and leaves the
 * flat cap faces carrying the shape you actually drew. The nose then sits 34 mm
 * further forward than the profile says (swallowing anything mounted on it) and
 * every wheel arch is 34 mm SMALLER than authored - which is a fender leaning
 * back over the tyre. Offsetting by -bevelSize puts the drawn outline at the
 * body's widest section and insets the caps instead: a real chamfer.
 */
function extrudeAcross(
  shape: THREE.Shape,
  halfWidth: number,
  bevelT: number,
  bevelS: number,
  bevelSegments = 2
): THREE.BufferGeometry {
  const depth = 2 * (halfWidth - bevelT)
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevelT,
    bevelSize: bevelS,
    bevelOffset: -bevelS,
    bevelSegments,
    steps: 1,
    curveSegments: 8,
  })
  // shape x -> car z, extrude axis -> car x
  g.rotateY(-Math.PI / 2)
  g.translate(halfWidth - bevelT, 0, 0)
  return g
}

/**
 * ExtrudeGeometry is non-indexed; BoxGeometry and friends are indexed, and
 * mergeGeometries refuses to mix the two. Flatten before merging.
 */
function flat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.index ? g.toNonIndexed() : g
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  rz = 0
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rz !== 0) g.rotateZ(rz)
  if (rx !== 0) g.rotateX(rx)
  g.translate(x, y, z)
  return g
}

// ---------- the main mass ----------

/**
 * The side profile, counter-clockwise. Read it top to bottom and you are
 * reading the car: nose face, bonnet, cowl, rising beltline, haunch, deck,
 * ducktail, Kamm chop, valance, arch, sill, arch, valance.
 */
function buildBodyShape(): THREE.Shape {
  const p: THREE.Vector2[] = [
    v2(Z_NOSE, -0.165), //         nose face, bottom
    v2(1.985, 0.155), //           nose face, top - raked back, not a slab
    v2(1.93, 0.245), //            bonnet leading edge
    v2(1.7, 0.288),
    v2(1.3, 0.325),
    v2(Z_COWL, 0.318), //          cowl - the windscreen stands here
    v2(0.2, 0.331),
    v2(-0.5, 0.352), //            beltline rises toward the rear
    v2(-1.05, 0.379), //           haunch shoulder, its high point
    v2(-1.45, 0.362),
    v2(-1.75, 0.344), //           deck
    v2(-1.88, 0.338),
    v2(-1.93, 0.362), //           ducktail lip
    v2(Z_TAIL, 0.346),
    v2(Z_TAIL, -0.08), //          Kamm: the tail is chopped, not tapered
    v2(-1.9, -0.24), //            rear valance
    v2(-1.833, SILL_Y),
  ]
  archArc(p, -WHEEL.halfBase, ARCH_R)
  p.push(v2(1.007, SILL_Y))
  archArc(p, WHEEL.halfBase, ARCH_R)
  p.push(v2(1.92, -0.285)) //      front valance
  return new THREE.Shape(p)
}

/** The greenhouse's outline: cowl, raked screen, one taut roof arc, backlight. */
function buildGlassShape(): THREE.Shape {
  return new THREE.Shape([
    v2(Z_COWL, 0.3), //            buried in the body's beltline
    v2(Z_SCREEN_TOP, 0.575), //    windscreen
    v2(-0.3, 0.615), //            crown, just behind centre
    v2(-0.6, 0.612),
    v2(Z_ROOF_REAR, 0.588),
    v2(Z_BACKLIGHT_BASE, 0.33), // backlight
  ])
}

/** A painted band lying over the glass core's roof. It overhangs the side glass
 *  by 4 cm, which is the shadow line that makes the window read as inset. */
function buildRoofShape(): THREE.Shape {
  return new THREE.Shape([
    v2(Z_ROOF_REAR, 0.532),
    v2(-0.6, 0.556),
    v2(-0.3, 0.559),
    v2(Z_SCREEN_TOP, 0.519),
    v2(Z_SCREEN_TOP, 0.575),
    v2(-0.3, 0.615),
    v2(-0.6, 0.612),
    v2(Z_ROOF_REAR, 0.588),
  ])
}

/** A- and C-pillars: painted bars standing proud of the glass on each side. */
function buildPillars(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const bar = (
    z0: number,
    y0: number,
    z1: number,
    y1: number,
    thick: number,
    width: number,
    x: number
  ) => {
    const dz = z1 - z0
    const dy = y1 - y0
    // Length is the span EXACTLY. Add half a thickness at each end and the bar
    // pokes out through the roof, which is what it was doing.
    const len = Math.hypot(dz, dy)
    const g = new THREE.BoxGeometry(width, thick, len)
    g.rotateX(-Math.atan2(dy, dz))
    g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2)
    return g
  }
  for (const s of [1, -1]) {
    parts.push(bar(Z_COWL - 0.02, 0.325, Z_SCREEN_TOP + 0.03, 0.558, 0.065, 0.055, s * 0.806))
    parts.push(bar(Z_ROOF_REAR - 0.02, 0.575, Z_BACKLIGHT_BASE + 0.03, 0.348, 0.075, 0.095, s * 0.802))
  }
  return mergeGeometries(parts, false)!
}

/** One horizontal swage crease down each flank. A diamond section, 2 cm proud:
 *  enough to catch a hard highlight line the whole length of the car. */
function buildSwage(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const s of [1, -1]) {
    const g = new THREE.BoxGeometry(0.03, 0.03, 3.28)
    g.rotateZ(Math.PI / 4)
    g.translate(s * 0.852, 0.105, 0.02)
    parts.push(g)
  }
  return mergeGeometries(parts, false)!
}

function buildMirrors(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const s of [1, -1]) {
    const pod = new THREE.BoxGeometry(0.135, 0.055, 0.1)
    pod.translate(s * 0.885, 0.372, 0.79)
    parts.push(pod)
  }
  return mergeGeometries(parts, false)!
}

// ---------- dark trim: sill, lips, splitter, diffuser, fascia panels ----------

/** A ring of dark trim around each arch opening, sitting on the flank. */
function buildArchLips(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const dy = SILL_Y - HUB_Y
  const dz = Math.sqrt(ARCH_R * ARCH_R - dy * dy)
  const enter = Math.atan2(dy, -dz) + Math.PI * 2
  const exit = Math.atan2(dy, dz)
  const sweep = enter - exit
  for (const cz of [WHEEL.halfBase, -WHEEL.halfBase]) {
    for (const s of [1, -1]) {
      const g = new THREE.TorusGeometry(ARCH_R - 0.006, 0.026, 6, 30, sweep)
      // The arc starts at the torus's local +x. Spin it back to the sill, then
      // stand the ring up in the z/y plane. Do NOT mirror it with a negative
      // scale: baking one into a geometry inverts its winding and the whole ring
      // gets backface-culled.
      g.rotateZ(exit)
      g.rotateY(Math.PI / 2)
      g.translate(s * (BODY_HALF - 0.004), HUB_Y, cz)
      parts.push(g)
    }
  }
  return mergeGeometries(parts, false)!
}

function buildDarkTrim(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    // sill strips, flush to the underside of the body - they close the gap
    // between the rocker and the road instead of floating below it
    box(0.055, 0.1, 2.9, 0.842, -0.352, -0.06),
    box(0.055, 0.1, 2.9, -0.842, -0.352, -0.06),
    box(1.5, 0.045, 0.3, 0, -0.302, 1.78), //   front splitter
    box(1.08, 0.13, 0.28, 0, -0.215, -1.85), // rear diffuser
    box(0.09, 0.035, 0.09, 0.815, 0.352, 0.86), // mirror stalks
    box(0.09, 0.035, 0.09, -0.815, 0.352, 0.86),
    // The grille band lies ON the raked nose face, not on an imaginary vertical
    // one, and it is deep enough that the headlights sit inside it.
    box(1.44, 0.205, 0.03, 0, -0.012, 2.019, -0.108),
    box(1.02, 0.07, 0.03, 0, -0.172, 2.014, -0.108), // lower intake
    // the vertical Kamm tail panel
    box(1.46, 0.225, 0.03, 0, 0.2, -1.963),

  ]
  for (const x of [0.32, -0.32]) {
    const pipe = new THREE.CylinderGeometry(0.048, 0.048, 0.12, 12)
    pipe.rotateX(Math.PI / 2)
    pipe.translate(x, -0.155, -1.97)
    parts.push(pipe)
  }
  parts.push(buildArchLips())
  return mergeGeometries(parts, false)!
}

/** Headlights sit IN the grille band, proud of it by half a centimetre. */
function buildHeadlights(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const x of [0.46, -0.46]) {
    parts.push(box(0.34, 0.075, 0.02, x, 0.038, 2.026, -0.108))
    parts.push(box(0.22, 0.018, 0.018, x * 1.06, -0.058, 2.014, -0.108))
  }
  return mergeGeometries(parts, false)!
}

/** Full-width bar plus two pods on the Kamm face. Rides carVisual.brake. */
function buildTaillights(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [box(1.36, 0.05, 0.025, 0, 0.232, -1.972)]
  for (const x of [0.5, -0.5]) parts.push(box(0.3, 0.088, 0.025, x, 0.232, -1.972))
  return mergeGeometries(parts, false)!
}

function buildReverseLights(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const x of [0.3, -0.3]) parts.push(box(0.14, 0.045, 0.02, x, 0.128, -1.97))
  return mergeGeometries(parts, false)!
}

// ---------- wheels ----------

/** Lathed tyre: real sidewalls, rounded shoulders, flat tread. Axle along X. */
function buildTyre(): THREE.BufferGeometry {
  const r = VIS_RADIUS
  const hw = WHEEL_WIDTH / 2
  const profile: THREE.Vector2[] = [
    v2(0.235, -hw),
    v2(0.28, -hw - 0.005),
    v2(0.315, -hw + 0.004),
    v2(r - 0.03, -hw + 0.032),
    v2(r, -hw + 0.075),
    v2(r, hw - 0.075),
    v2(r - 0.03, hw - 0.032),
    v2(0.315, hw - 0.004),
    v2(0.28, hw + 0.005),
    v2(0.235, hw),
  ]
  const g = new THREE.LatheGeometry(profile, 26)
  g.rotateZ(Math.PI / 2)
  return g
}

/** Dark alloy: barrel, dished face, five spokes, hub cap, brake disc. */
function buildRim(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const hw = WHEEL_WIDTH / 2

  const barrel = new THREE.CylinderGeometry(0.245, 0.245, WHEEL_WIDTH * 0.88, 22, 1, true)
  barrel.rotateZ(Math.PI / 2)
  parts.push(barrel)

  const face = new THREE.CylinderGeometry(0.25, 0.25, 0.026, 24)
  face.rotateZ(Math.PI / 2)
  face.translate(hw - 0.02, 0, 0)
  parts.push(face)

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const spoke = new THREE.BoxGeometry(0.046, 0.15, 0.062)
    spoke.translate(0, 0.16, 0)
    spoke.rotateX(a)
    spoke.translate(hw - 0.024, 0, 0)
    parts.push(spoke)
  }

  const cap = new THREE.CylinderGeometry(0.06, 0.055, 0.03, 12)
  cap.rotateZ(Math.PI / 2)
  cap.translate(hw + 0.002, 0, 0)
  parts.push(cap)

  const disc = new THREE.CylinderGeometry(0.212, 0.212, 0.022, 18)
  disc.rotateZ(Math.PI / 2)
  disc.translate(hw - 0.085, 0, 0)
  parts.push(disc)

  return mergeGeometries(parts, false)!
}

/** The polished lip. One bright ring is worth more than a whole bright rim. */
function buildRimLip(): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(0.252, 0.013, 8, 30)
  g.rotateY(Math.PI / 2)
  g.translate(WHEEL_WIDTH / 2 - 0.016, 0, 0)
  return g
}

// ---------- the soft shadow the car sits in ----------

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

  const geom = useMemo(() => {
    const shell = extrudeAcross(buildBodyShape(), BODY_HALF, BEVEL_T, BEVEL_S, 2)
    const paint = mergeGeometries([flat(shell), flat(buildSwage())], false)!
    const roof = extrudeAcross(buildRoofShape(), ROOF_HALF, 0.035, 0.022, 2)
    const cabin = mergeGeometries(
      [flat(roof), flat(buildPillars()), flat(buildMirrors())],
      false
    )!
    return {
      paint,
      cabin,
      glass: extrudeAcross(buildGlassShape(), GLASS_HALF, 0.03, 0.02, 1),
      trim: buildDarkTrim(),
      head: buildHeadlights(),
      tail: buildTaillights(),
      reverse: buildReverseLights(),
      tyre: buildTyre(),
      rim: buildRim(),
      rimLip: buildRimLip(),
    }
  }, [])
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
        if (shadow) shadow.position.y = hubSum * 0.25 - VIS_RADIUS + 0.006

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
        <mesh geometry={geom.paint} castShadow receiveShadow>
          {/* clearcoat over a metallic base: the environment map gives it a sky
              to mirror, and the two-lobe specular says "car paint" rather than
              "shiny plastic". The chamfers are what it hangs its highlights on. */}
          <meshPhysicalMaterial
            color={CONFIG.carColor}
            roughness={0.24}
            metalness={0.42}
            clearcoat={1}
            clearcoatRoughness={0.05}
            envMapIntensity={1.15}
          />
        </mesh>

        <mesh geometry={geom.cabin} castShadow receiveShadow>
          <meshPhysicalMaterial
            color={CONFIG.carColor}
            roughness={0.24}
            metalness={0.42}
            clearcoat={1}
            clearcoatRoughness={0.05}
            envMapIntensity={1.15}
          />
        </mesh>

        {/* Narrower than the roof band and the pillars, so it reads as glass set
            into a frame. Opaque: transmission would cost a second render of the
            scene for a cabin nobody can see into. */}
        <mesh geometry={geom.glass} castShadow>
          <meshStandardMaterial
            color={GLASS_COLOUR}
            roughness={0.12}
            metalness={0.9}
            envMapIntensity={1.15}
          />
        </mesh>

        <mesh geometry={geom.trim} castShadow>
          <meshStandardMaterial color={DARK_TRIM_COLOUR} roughness={0.66} metalness={0.15} />
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
            color={TRIM_COLOUR}
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
        <planeGeometry args={[SHADOW_WIDTH, 4.5]} />
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
            // polished lip end up outboard on both sides. Rotation about X
            // commutes with an X mirror, so the spin direction is untouched.
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
            <mesh geometry={geom.rim} castShadow>
              <meshStandardMaterial
                color={RIM_COLOUR}
                roughness={0.38}
                metalness={0.85}
                envMapIntensity={1.1}
              />
            </mesh>
            <mesh geometry={geom.rimLip}>
              <meshStandardMaterial
                color={RIM_LIP_COLOUR}
                roughness={0.16}
                metalness={1}
                envMapIntensity={1.6}
              />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
})
