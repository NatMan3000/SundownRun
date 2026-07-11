import { useMemo } from 'react'
import * as THREE from 'three'
import { getTerrainHeight } from '../core/terrain'

// ============================================================
// STONE GATES - thread-the-monolith targets
//
// Three pairs of balanced sandstone hoodoos, one guarding a jump approach in each
// corner of the playground. They reshape nothing (unlike the terrain playgrounds) -
// natural-looking stacked-slab pillars whose gap is the scored line (archGates.ts).
// The old timber-and-checker gantries read as start lines dropped in the middle of
// nowhere (Nathan, playtest round 4); pillars read as landscape.
//
// One merged mesh, one draw call, zero per-frame work - built once at mount.
// Pillars are solid - colliders in Colliders.tsx.
// ============================================================

/** Pillar footprint half-width (base course) and total standing height. */
const PILLAR_HALF = 0.85
const PILLAR_HEIGHT = 5.0

const AXIS_Y = new THREE.Vector3(0, 1, 0)

export interface ArchDef {
  x: number
  z: number
  /** direction you thread the gate, radians */
  heading: number
  /** half the drivable gap between the posts, metres */
  halfGap: number
}

// One gate per corner of the playground, not a cluster: each sits ~40 m up the
// approach line of a jump (matching its heading), so threading the gate aims you
// straight at the launch. Each gap is ~8 m - wide enough to thread at speed, tight
// enough to feel like a target.
export const RIDGE_ARCHES: readonly ArchDef[] = [
  // gate onto the ridge run - thread it and the two spine kickers are dead ahead
  { x: 150, z: 205, heading: 0.25, halfGap: 4.2 },
  // guards the infield double (playground at -84,-54, heading 1.9) - 90 m up the
  // approach, where the ground is flattest (probed: 0.64 m across the gap)
  { x: -169, z: -25, heading: 1.9, halfGap: 4.2 },
  // guards the dare-you double (playground at 214,-170, heading 0.55) - 55 m out,
  // near-perfectly level footing (0.03 m across the gap)
  { x: 185, z: -217, heading: 0.55, halfGap: 4.2 },
]

/** Across-travel (left normal) unit vector for a heading, in the xz plane. */
function acrossOf(heading: number): [number, number] {
  return [-Math.sin(heading), Math.cos(heading)]
}

/** Post box colliders, consumed by Colliders.tsx. Reachable geometry is solid geometry. */
export const RIDGE_ARCH_POSTS = (() => {
  const posts: {
    x: number
    y: number
    z: number
    rotY: number
    halfX: number
    halfY: number
    halfZ: number
  }[] = []
  for (const a of RIDGE_ARCHES) {
    const [ax, az] = acrossOf(a.heading)
    for (const side of [1, -1]) {
      const lat = (a.halfGap + 0.6) * side
      const x = a.x + ax * lat
      const z = a.z + az * lat
      const g = getTerrainHeight(x, z)
      posts.push({
        x,
        y: g + PILLAR_HEIGHT / 2,
        z,
        rotY: a.heading,
        halfX: PILLAR_HALF * 0.85, // a touch inside the visual slabs, so clips feel fair
        halfY: PILLAR_HEIGHT / 2,
        halfZ: PILLAR_HALF * 0.8,
      })
    }
  }
  return posts
})()

/** A single oriented box, pushed into shared position/colour arrays. Mirrors StartLine.tsx. */
function box(
  pos: number[],
  cols: number[],
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  right: THREE.Vector3,
  fwd: THREE.Vector3,
  base: THREE.Color,
  lit: THREE.Color
): void {
  const v = (sx: number, sy: number, sz: number) => {
    pos.push(
      cx + right.x * sx * hx + fwd.x * sz * hz,
      cy + sy * hy,
      cz + right.z * sx * hx + fwd.z * sz * hz
    )
  }
  const faces: [number, number, number][][] = [
    [
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
    [
      [1, -1, -1],
      [-1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
    ],
    [
      [1, -1, 1],
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
    ],
    [
      [-1, -1, -1],
      [-1, -1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
    ],
    [
      [-1, 1, 1],
      [1, 1, 1],
      [1, 1, -1],
      [-1, 1, -1],
    ],
    [
      [-1, -1, -1],
      [1, -1, -1],
      [1, -1, 1],
      [-1, -1, 1],
    ],
  ]
  for (let fi = 0; fi < faces.length; fi++) {
    const q = faces[fi]
    const c = fi === 4 ? lit : base // sun-bleached on top
    for (const k of [0, 1, 2, 0, 2, 3]) {
      v(q[k][0], q[k][1], q[k][2])
      cols.push(c.r, c.g, c.b)
    }
  }
}

function buildArches(): THREE.BufferGeometry {
  const pos: number[] = []
  const cols: number[] = []

  for (const a of RIDGE_ARCHES) {
    const [ax, az] = acrossOf(a.heading)
    const right = new THREE.Vector3(ax, 0, az) //                 across the gate
    const fwd = new THREE.Vector3(Math.cos(a.heading), 0, Math.sin(a.heading)) // along the thread

    // Two weathered stone monoliths flanking the gap - stacked slabs, each course a
    // touch smaller and twisted off the one below, the way desert hoodoos balance.
    // No beam, no checker: these read as landscape, not race furniture. The gap
    // between them is still the scored line (archGates.ts is unchanged).
    for (const side of [1, -1]) {
      const lat = (a.halfGap + 0.6) * side
      const px = a.x + ax * lat
      const pz = a.z + az * lat
      const g = getTerrainHeight(px, pz)
      // deterministic per-pillar variation from position - no RNG, identical every build
      const seed = Math.abs(Math.sin(px * 12.9898 + pz * 78.233)) * 43758.5453
      const jitter = (k: number) => (((seed * (k + 1)) % 1) - 0.5)
      const courses = 4
      let y = g
      for (let c = 0; c < courses; c++) {
        const t = c / (courses - 1)
        const hh = 0.75 - t * 0.18 //          course half-height, shorter toward the top
        const hw = 0.85 - t * 0.38 //          course half-width, tapering
        const twist = jitter(c) * 0.5
        const cr = new THREE.Vector3().copy(right).applyAxisAngle(AXIS_Y, twist)
        const cf = new THREE.Vector3().copy(fwd).applyAxisAngle(AXIS_Y, twist)
        const ox = jitter(c + 7) * 0.22
        const oz = jitter(c + 13) * 0.22
        // warm sandstone, sun-bleached top faces, darker base course
        const shade = 0.82 + t * 0.16
        const base = new THREE.Color(shade * 0.78, shade * 0.7, shade * 0.6)
        const litc = new THREE.Color(shade * 0.92, shade * 0.84, shade * 0.7)
        box(pos, cols, px + ox, y + hh, pz + oz, hw, hh, hw * 0.92, cr, cf, base, litc)
        y += hh * 2 - 0.1 // slight overlap so no daylight between courses
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

export function RidgeArches() {
  const geo = useMemo(buildArches, [])
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.85} metalness={0} flatShading />
    </mesh>
  )
}
