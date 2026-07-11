import { useMemo } from 'react'
import * as THREE from 'three'
import { getTerrainHeight } from '../core/terrain'

// ============================================================
// RIDGE ARCHES - a thread-the-gate run on the switchback spine
//
// Three weathered timber gates straddling the ridge between the switchback legs. They
// reshape nothing (unlike the terrain playgrounds) - just posts to thread and a checkered
// banner that echoes the start gantry, so the ridge reads as a place a kid is meant to
// play. Posts are solid (colliders in Colliders.tsx); the gap between them is the line.
//
// One merged mesh, one draw call, zero per-frame work - built once at mount.
// ============================================================

const POST_HALF = 0.16
const POST_HEIGHT = 4.6
const BEAM_DROP = 0.25

const TIMBER = new THREE.Color('#6B4F35')
const TIMBER_LIT = new THREE.Color('#8A6A48')
const CREAM = new THREE.Color('#D8C9A8')
const CHAR = new THREE.Color('#2E2A27')

export interface ArchDef {
  x: number
  z: number
  /** direction you thread the gate, radians */
  heading: number
  /** half the drivable gap between the posts, metres */
  halfGap: number
}

// Stepping north-east up the ridge, roughly parallel to the run of tight ramp kickers
// in core/terrain's PLAYGROUNDS. Each gap is ~8 m - wide enough to thread at speed, tight
// enough to feel like a target.
export const RIDGE_ARCHES: readonly ArchDef[] = [
  { x: 150, z: 205, heading: 0.25, halfGap: 4.2 },
  { x: 205, z: 218, heading: 0.25, halfGap: 4.2 },
  { x: 258, z: 232, heading: 0.25, halfGap: 4.2 },
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
      const lat = (a.halfGap + POST_HALF) * side
      const x = a.x + ax * lat
      const z = a.z + az * lat
      const g = getTerrainHeight(x, z)
      posts.push({
        x,
        y: g + POST_HEIGHT / 2,
        z,
        rotY: a.heading,
        halfX: POST_HALF,
        halfY: POST_HEIGHT / 2,
        halfZ: POST_HALF,
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

    const g0 = getTerrainHeight(a.x + ax * a.halfGap, a.z + az * a.halfGap)
    const g1 = getTerrainHeight(a.x - ax * a.halfGap, a.z - az * a.halfGap)
    const gTop = Math.max(g0, g1) + POST_HEIGHT

    // the two posts
    for (const side of [1, -1]) {
      const lat = (a.halfGap + POST_HALF) * side
      const px = a.x + ax * lat
      const pz = a.z + az * lat
      const g = getTerrainHeight(px, pz)
      box(pos, cols, px, g + POST_HEIGHT / 2, pz, POST_HALF, POST_HEIGHT / 2, POST_HALF, right, fwd, TIMBER, TIMBER_LIT)
    }
    // crossbeam spanning the post tops
    box(pos, cols, a.x, gTop - BEAM_DROP, a.z, a.halfGap + POST_HALF, 0.2, 0.28, right, fwd, TIMBER, TIMBER_LIT)
    // a checkered banner hanging under the beam, echoing the start gantry
    const banners = 10
    const bw = (a.halfGap + POST_HALF) / banners
    for (let i = 0; i < banners; i++) {
      const lat = -(a.halfGap + POST_HALF) + (i * 2 + 1) * bw
      const c = i % 2 === 0 ? CREAM : CHAR
      box(pos, cols, a.x + ax * lat, gTop - BEAM_DROP - 0.55, a.z + az * lat, bw, 0.3, 0.04, right, fwd, c, c)
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
