// ============================================================
//  CAR BODY - the Sundown garage
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
//     The wheels are SHARED by every body: they are built once at
//     module scope and never rebuilt when the car changes.
//
//  4. SYNC. `sync()` is called by Vehicle ONCE per rendered frame,
//     after the physics has written carVisual and before three
//     renders. Do all mesh updates there. Do not add a useFrame -
//     a child's useFrame runs BEFORE its parent's, which would put
//     the wheels one frame behind the car.
//
//  Nothing here allocates per frame. sync() is identical across
//  all four bodies.
//
// ------------------------------------------------------------
//  HOW A BODY IS BUILT - surfaces, edges, no balloons
//
//  The mass is ONE 2D side profile (a THREE.Shape in the z/y
//  plane) extruded across the car's width, with the wheel arches
//  cut into it as clean 24-segment arcs. The extrusion takes a
//  SMALL bevel - a few centimetres, two segments. That single
//  number is why the car reads as panels rather than as a balloon:
//  every silhouette edge becomes a crisp chamfer with its own
//  highlight instead of a fat radius.
//
//  Nothing wraps over a tyre. Each body's flank stays inboard of
//  WHEEL_OUTER, so the wheels stand PROUD of the paint, and every
//  arch opening clears the tread by 7-9 cm. You can always see the
//  whole wheel.
//
//  The greenhouse is a separate, narrower volume: a dark glass core
//  with a painted roof band and painted pillars sitting proud of
//  it, so the side glass reads as an inset panel inside a frame.
//
//  The four profiles live in carBodyProfiles.ts. Selection comes
//  from the store (the title-screen garage), and each body's
//  geometry is built once and cached, so cycling back is instant.
// ============================================================

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CONFIG } from '../core/config'
import { useGameStore } from '../core/store'
import type { CarBodyId } from '../core/store'
import { carVisual } from './carVisual'
import type { CarBodyHandle } from './carVisual'
import { WHEEL } from './tuning'
import {
  BODY_SPECS,
  HUB_Y,
  VIS_RADIUS,
  WHEEL_WIDTH,
  archHalfChord,
  buildGlassShape,
  buildProfile,
  buildRoofShape,
  glassHalfWidth,
} from './carBodyProfiles'
import type { BodySpec, BoxSpec } from './carBodyProfiles'

// ---------- palette ----------

const GLASS_COLOUR = '#0A1119'
const TRIM_COLOUR = '#24262A'
const DARK_TRIM_COLOUR = '#15171B'
const TYRE_COLOUR = '#1E1D22'
const RIM_COLOUR = '#3B3F45'
const RIM_LIP_COLOUR = '#D9D2C1'
const HEADLIGHT_COLOUR = '#FFF4DC'
const TAIL_COLOUR = '#FF2A16'

const ROAD_Y = -0.542 //   the road, at rest, in chassis-local space

// ---------- geometry plumbing ----------

/**
 * ExtrudeGeometry is non-indexed; Box, Cylinder, Torus and Lathe are indexed.
 * mergeGeometries silently returns NULL when it is handed a mix - and a null
 * geometry reaching three kills the entire frame with a `boundingSphere` of
 * null, six thousand times a second, behind a black canvas. So: flatten every
 * part first, and never assert. A loud throw at mount beats a silent void.
 */
function flat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.index ? g.toNonIndexed() : g
}

function merge(parts: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map(flat), false)
  if (!merged) {
    throw new Error(
      `CarBody: mergeGeometries returned null for "${label}" (${parts.length} parts). ` +
        'Every part must share the same attributes and index-ness.'
    )
  }
  return merged
}

function box(s: BoxSpec, mirrorX = false): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(s.w, s.h, s.d)
  if (s.rx) g.rotateX(s.rx)
  g.translate(mirrorX ? -s.x : s.x, s.y, s.z)
  return g
}

/** Extrude a z/y side profile across the car's width, chamfered at both flanks. */
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
    // NOT decoration. With the default 0, three GROWS the outline by bevelSize
    // through the middle of the extrusion and leaves the flat caps carrying the
    // shape you actually drew: the nose ends up further forward than the profile
    // says (swallowing anything mounted on it) and every wheel arch comes out
    // SMALLER than authored - a fender leaning back over the tyre. Offsetting by
    // -bevelSize puts the drawn outline at the widest section and insets the
    // caps instead, which is a real chamfer.
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

// ---------- per-body parts ----------

/** One horizontal swage crease down each flank: a diamond section, proud enough
 *  to catch a hard highlight the whole length of the car. */
function buildSwage(s: BodySpec): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const side of [1, -1]) {
    const g = new THREE.BoxGeometry(0.03, 0.03, s.swage.len)
    g.rotateZ(Math.PI / 4)
    if (s.swage.rx) g.rotateX(s.swage.rx)
    g.translate(side * (s.bodyHalf - 0.003), s.swage.y, s.swage.z)
    parts.push(g)
  }
  return merge(parts, 'swage')
}

/** A- and C-pillars: painted bars standing proud of the glass on each side. */
function buildPillars(s: BodySpec): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const side of [1, -1]) {
    for (const p of s.pillars) {
      const dz = p.z1 - p.z0
      const dy = p.y1 - p.y0
      // Length is the span EXACTLY. Add half a thickness at each end and the bar
      // pokes out through the roof.
      const g = new THREE.BoxGeometry(p.width, p.thick, Math.hypot(dz, dy))
      g.rotateX(-Math.atan2(dy, dz))
      g.translate(side * p.x, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2)
      parts.push(g)
    }
  }
  return merge(parts, 'pillars')
}

function buildMirrors(s: BodySpec): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const side of [1, -1]) {
    const pod = new THREE.BoxGeometry(0.135, 0.055, 0.1)
    pod.translate(side * s.mirror.x, s.mirror.y, s.mirror.z)
    parts.push(pod)
  }
  return merge(parts, 'mirrors')
}

/** A ring of dark trim around each arch opening, sitting on the flank. */
function buildArchLips(s: BodySpec): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const dy = s.sillY - HUB_Y
  const dz = archHalfChord(s)
  const enter = Math.atan2(dy, -dz) + Math.PI * 2
  const exit = Math.atan2(dy, dz)
  const sweep = enter - exit
  for (const cz of [WHEEL.halfBase, -WHEEL.halfBase]) {
    for (const side of [1, -1]) {
      const g = new THREE.TorusGeometry(s.archR - 0.006, 0.026, 6, 30, sweep)
      // The arc starts at the torus's local +x. Spin it back to the sill, then
      // stand the ring up in the z/y plane. Do NOT mirror it with a negative
      // scale: baking one into a geometry inverts its winding and the whole ring
      // gets backface-culled.
      g.rotateZ(exit)
      g.rotateY(Math.PI / 2)
      g.translate(side * (s.bodyHalf - 0.004), HUB_Y, cz)
      parts.push(g)
    }
  }
  return merge(parts, 'archLips')
}

function buildDarkTrim(s: BodySpec): THREE.BufferGeometry {
  const chord = archHalfChord(s)
  const sillLen = 2 * (WHEEL.halfBase - chord) - 0.04
  const parts: THREE.BufferGeometry[] = [
    // sill strips, flush to the underside - they close the gap between the
    // rocker and the road instead of floating below it
    box({ w: 0.055, h: 0.1, d: sillLen, x: s.sillOffsetX, y: s.sillY - 0.032, z: 0 }),
    box({ w: 0.055, h: 0.1, d: sillLen, x: -s.sillOffsetX, y: s.sillY - 0.032, z: 0 }),
    box(s.splitter),
    box(s.diffuser),
    box(s.grille),
    box(s.tailPanel),
    box({ w: 0.09, h: 0.035, d: 0.09, x: s.mirror.x - 0.07, y: s.mirror.y - 0.02, z: s.mirror.z + 0.07 }),
    box({ w: 0.09, h: 0.035, d: 0.09, x: -(s.mirror.x - 0.07), y: s.mirror.y - 0.02, z: s.mirror.z + 0.07 }),
  ]
  if (s.intake) parts.push(box(s.intake))
  for (const side of [1, -1]) {
    const pipe = new THREE.CylinderGeometry(0.048, 0.048, 0.12, 12)
    pipe.rotateX(Math.PI / 2)
    pipe.translate(side * s.exhaust.x, s.exhaust.y, s.exhaust.z)
    parts.push(pipe)
  }
  parts.push(buildArchLips(s))
  return merge(parts, 'darkTrim')
}

/** Headlights sit IN the grille band, proud of it by a few millimetres. */
function buildHeadlights(s: BodySpec): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [box(s.headlight), box(s.headlight, true)]
  if (s.headlightStrip) parts.push(box(s.headlightStrip), box(s.headlightStrip, true))
  return merge(parts, 'headlights')
}

/** Full-width bar plus two pods on the tail face. Rides carVisual.brake. */
function buildTaillights(s: BodySpec): THREE.BufferGeometry {
  return merge([box(s.tailBar), box(s.tailPod), box(s.tailPod, true)], 'taillights')
}

function buildReverseLights(s: BodySpec): THREE.BufferGeometry {
  return merge([box(s.reverse), box(s.reverse, true)], 'reverse')
}

// ---------- wheels: shared by every body, built once ----------

/** Lathed tyre: real sidewalls, rounded shoulders, flat tread. Axle along X. */
function buildTyre(): THREE.BufferGeometry {
  const r = VIS_RADIUS
  const hw = WHEEL_WIDTH / 2
  const v2 = (x: number, y: number) => new THREE.Vector2(x, y)
  const g = new THREE.LatheGeometry(
    [
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
    ],
    26
  )
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
    const spoke = new THREE.BoxGeometry(0.046, 0.15, 0.062)
    spoke.translate(0, 0.16, 0)
    spoke.rotateX((i / 5) * Math.PI * 2)
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

  return merge(parts, 'rim')
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

// ---------- lazy, cached, shared ----------

export interface BodyGeometry {
  paint: THREE.BufferGeometry
  cabin: THREE.BufferGeometry
  glass: THREE.BufferGeometry
  trim: THREE.BufferGeometry
  head: THREE.BufferGeometry
  tail: THREE.BufferGeometry
  reverse: THREE.BufferGeometry
  shadowWidth: number
}

function buildBody(id: CarBodyId): BodyGeometry {
  const s = BODY_SPECS[id]
  const shell = extrudeAcross(buildProfile(s), s.bodyHalf, s.bevelT, s.bevelS, 2)
  const roof = extrudeAcross(buildRoofShape(s), s.roofHalf, 0.035, 0.022, 2)
  const cabinParts = [roof, buildPillars(s), buildMirrors(s)]
  if (s.spoiler) cabinParts.push(box(s.spoiler))
  return {
    paint: merge([shell, buildSwage(s)], `${id}:paint`),
    cabin: merge(cabinParts, `${id}:cabin`),
    glass: extrudeAcross(buildGlassShape(s), glassHalfWidth(s), 0.03, 0.02, 1),
    trim: buildDarkTrim(s),
    head: buildHeadlights(s),
    tail: buildTaillights(s),
    reverse: buildReverseLights(s),
    // the blob spans the TRACK, not the paint - the wheels are wider
    shadowWidth: (WHEEL.halfTrack + WHEEL_WIDTH / 2) * 2 + 0.35,
  }
}

/** Built on first selection, kept for the session: cycling the garage is instant.
 *  Exported so the ghost car (GhostCar.tsx) replays the recorded body with the
 *  exact same cached geometry instead of authoring a second model. */
const bodyCache = new Map<CarBodyId, BodyGeometry>()
export function getBody(id: CarBodyId): BodyGeometry {
  let g = bodyCache.get(id)
  if (!g) {
    g = buildBody(id)
    bodyCache.set(id, g)
  }
  return g
}

export const WHEEL_GEOM = {
  tyre: buildTyre(),
  rim: buildRim(),
  rimLip: buildRimLip(),
}

let shadowTexture: THREE.CanvasTexture | null = null
function getShadowTexture(): THREE.CanvasTexture {
  if (!shadowTexture) shadowTexture = buildUnderShadowTexture()
  return shadowTexture
}

// ============================================================

export const CarBody = forwardRef<CarBodyHandle>(function CarBody(_props, ref) {
  const bodyRef = useRef<THREE.Group>(null)
  const steerRefs = useRef<(THREE.Group | null)[]>([null, null, null, null])
  const spinRefs = useRef<(THREE.Group | null)[]>([null, null, null, null])
  const tailMat = useRef<THREE.MeshStandardMaterial>(null)
  const reverseMat = useRef<THREE.MeshStandardMaterial>(null)
  const shadowRef = useRef<THREE.Mesh>(null)

  // The garage. Re-renders (and swaps the car) only when the selection changes,
  // which happens on the title screen, never mid-lap.
  const bodyId = useGameStore((s) => s.carBody)
  const geom = useMemo(() => getBody(bodyId), [bodyId])
  const shadowTex = getShadowTexture()

  // sync() is identical for every body: it only ever touches the sprung group,
  // the four wheel nodes and three emissive materials.
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
        <planeGeometry args={[geom.shadowWidth, 4.5]} />
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
            <mesh geometry={WHEEL_GEOM.tyre} castShadow receiveShadow>
              <meshStandardMaterial
                color={TYRE_COLOUR}
                roughness={0.88}
                metalness={0}
                envMapIntensity={0.9}
              />
            </mesh>
            <mesh geometry={WHEEL_GEOM.rim} castShadow>
              <meshStandardMaterial
                color={RIM_COLOUR}
                roughness={0.38}
                metalness={0.85}
                envMapIntensity={1.1}
              />
            </mesh>
            <mesh geometry={WHEEL_GEOM.rimLip}>
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
