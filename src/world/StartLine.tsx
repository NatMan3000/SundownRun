import { useMemo } from 'react'
import * as THREE from 'three'
import { ROAD_RIBBON_HALF, ROAD_WIDTH, START_LINE_T, roadSpline } from '../core/terrain'

// ============================================================
// START / FINISH
//
// Lap timing keys on a forward crossing of the spline's START_LINE_T (vehicle/lapTracker.ts),
// so the paint sits exactly there - not near there. The band is lofted from the road frame
// at that same station, layered 1.5 cm above the asphalt with a polygon offset so it can
// never z-fight the road it belongs to.
//
// Two draw calls: the checkered band, and the gantry. The gantry casts the long
// golden-hour shadow that tells you where the line is from half a straight away.
// ============================================================

const BAND_HALF_LENGTH = 0.8 //  metres of road covered, either side of t=0
const ROWS = 2
const COLUMNS = 12
/**
 * The ribbon already sits 0.015 m over the collider, so this clears the asphalt by
 * 1.3 cm. The polygon offset below does the real work; this is belt and braces.
 */
const LIFT = 0.028

const POST_LATERAL = ROAD_RIBBON_HALF + 0.7 // clear of the ribbon, on flat corridor
const POST_HALF = 0.16
const POST_HEIGHT = 6.0
const BEAM_HEIGHT = 5.3
const BEAM_DEPTH = 0.34

const CREAM = new THREE.Color('#D8C9A8')
const CHAR = new THREE.Color('#2E2A27')
const TIMBER = new THREE.Color('#6B4F35')
const TIMBER_LIT = new THREE.Color('#8A6A48')

const _sp = new THREE.Vector3()
const _st = new THREE.Vector3()

/** The station at START_LINE_T, and the road frame there. */
function startFrame() {
  const p = roadSpline.getPointAt(START_LINE_T, _sp)
  const tan = roadSpline.getTangentAt(START_LINE_T, _st)
  // flatten the tangent into the xz plane and re-normalise for the road frame
  const len = Math.hypot(tan.x, tan.z) || 1
  const tx = tan.x / len
  const tz = tan.z / len
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    // unit tangent (along the road) and lateral normal, both in the xz plane
    tx,
    tz,
    nx: tz,
    nz: -tx,
    rotY: Math.atan2(tx, tz),
  }
}

/** Post colliders, consumed by Colliders.tsx. Reachable geometry is solid geometry. */
export const START_LINE_POSTS = (() => {
  const f = startFrame()
  return [1, -1].map((side) => ({
    x: f.x + f.nx * POST_LATERAL * side,
    y: f.y + POST_HEIGHT / 2,
    z: f.z + f.nz * POST_LATERAL * side,
    rotY: f.rotY,
    halfX: POST_HALF,
    halfY: POST_HEIGHT / 2,
    halfZ: POST_HALF,
  }))
})()

function buildBand(): THREE.BufferGeometry {
  const f = startFrame()
  // Reach a touch past the asphalt so the paint dies in the dust, as real paint does.
  const half = ROAD_WIDTH / 2 + 0.35
  const quads = ROWS * COLUMNS
  const position = new Float32Array(quads * 6 * 3)
  const normal = new Float32Array(quads * 6 * 3)
  const color = new Float32Array(quads * 6 * 3)
  const y = f.y + LIFT
  let o = 0

  const put = (lat: number, along: number, c: THREE.Color) => {
    position[o] = f.x + f.nx * lat + f.tx * along
    position[o + 1] = y
    position[o + 2] = f.z + f.nz * lat + f.tz * along
    normal[o + 1] = 1
    color[o] = c.r
    color[o + 1] = c.g
    color[o + 2] = c.b
    o += 3
  }

  for (let r = 0; r < ROWS; r++) {
    const a0 = -BAND_HALF_LENGTH + (r / ROWS) * BAND_HALF_LENGTH * 2
    const a1 = -BAND_HALF_LENGTH + ((r + 1) / ROWS) * BAND_HALF_LENGTH * 2
    for (let c = 0; c < COLUMNS; c++) {
      const l0 = -half + (c / COLUMNS) * half * 2
      const l1 = -half + ((c + 1) / COLUMNS) * half * 2
      const col = (r + c) % 2 === 0 ? CREAM : CHAR
      // Wind them so the face normal points UP. The lateral axis crossed into the
      // tangent gives (0,-1,0), so the naive order faces the ground and three culls
      // the whole band as a back face - the paint simply is not there.
      put(l0, a0, col)
      put(l1, a1, col)
      put(l1, a0, col)
      put(l0, a0, col)
      put(l0, a1, col)
      put(l1, a1, col)
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  g.setAttribute('color', new THREE.BufferAttribute(color, 3))
  g.computeBoundingSphere()
  return g
}

function box(
  out: number[],
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
  // 8 corners in road space (right, up, forward), pushed to world
  const v = (sx: number, sy: number, sz: number, target: number[]) => {
    target.push(
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
    ], // +fwd
    [
      [1, -1, -1],
      [-1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
    ], // -fwd
    [
      [1, -1, 1],
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
    ], // +right
    [
      [-1, -1, -1],
      [-1, -1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
    ], // -right
    [
      [-1, 1, 1],
      [1, 1, 1],
      [1, 1, -1],
      [-1, 1, -1],
    ], // top
    [
      [-1, -1, -1],
      [1, -1, -1],
      [1, -1, 1],
      [-1, -1, 1],
    ], // bottom
  ]
  for (let fi = 0; fi < faces.length; fi++) {
    const q = faces[fi]
    const c = fi === 4 ? lit : base // sun-bleached on top
    const order = [0, 1, 2, 0, 2, 3]
    for (const k of order) {
      v(q[k][0], q[k][1], q[k][2], out)
      cols.push(c.r, c.g, c.b)
    }
  }
}

function buildGantry(): THREE.BufferGeometry {
  const f = startFrame()
  const right = new THREE.Vector3(f.nx, 0, f.nz)
  const fwd = new THREE.Vector3(f.tx, 0, f.tz)
  const pos: number[] = []
  const cols: number[] = []

  for (const side of [1, -1]) {
    box(
      pos,
      cols,
      f.x + f.nx * POST_LATERAL * side,
      f.y + POST_HEIGHT / 2,
      f.z + f.nz * POST_LATERAL * side,
      POST_HALF,
      POST_HEIGHT / 2,
      POST_HALF,
      right,
      fwd,
      TIMBER,
      TIMBER_LIT
    )
  }
  // the crossbeam, and a checkered banner hanging under it
  box(
    pos,
    cols,
    f.x,
    f.y + BEAM_HEIGHT + 0.3,
    f.z,
    POST_LATERAL + POST_HALF,
    0.22,
    BEAM_DEPTH / 2,
    right,
    fwd,
    TIMBER,
    TIMBER_LIT
  )
  const banners = 14
  const bw = (POST_LATERAL + POST_HALF) / banners
  for (let i = 0; i < banners; i++) {
    const lat = -(POST_LATERAL + POST_HALF) + (i * 2 + 1) * bw
    const c = i % 2 === 0 ? CREAM : CHAR
    box(
      pos,
      cols,
      f.x + f.nx * lat,
      f.y + BEAM_HEIGHT - 0.35,
      f.z + f.nz * lat,
      bw,
      0.35,
      0.05,
      right,
      fwd,
      c,
      c
    )
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

export function StartLine() {
  const band = useMemo(buildBand, [])
  const gantry = useMemo(buildGantry, [])

  return (
    <>
      <mesh geometry={band} receiveShadow castShadow={false}>
        <meshStandardMaterial
          vertexColors
          roughness={0.72}
          metalness={0}
          dithering
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-6}
        />
      </mesh>
      <mesh geometry={gantry} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.85} metalness={0} flatShading />
      </mesh>
    </>
  )
}
