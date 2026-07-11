import { useMemo } from 'react'
import * as THREE from 'three'
import { getAirRuns, getTerrainHeight } from '../core/terrain'
import { getRimRunGates } from './rimRunGates'

// ============================================================
// RIM-RUN MARKERS - so a kid reads a big-air run instantly
//
// The runs are shaped into the TERRAIN (core/terrain.ts); this file is only the
// timber-and-checker signage that says "play here", in the same language as the
// start gantry and the ridge arches:
//
//   - a threaded GATE at the top of each descent (scored - rimRunGates.ts),
//   - a line of checker pennant posts down each chute and up each ascent leg,
//   - a pair of tall flags flanking the launch kicker (the "send it" marker),
//   - a pair at the far end of the landing runway (where to aim).
//
// One merged mesh, one draw call, zero per-frame work - built once at mount. The
// flag posts carry NO colliders (you drive through the lane at speed); only the
// two gate posts per run are solid, exported for Colliders.tsx.
// ============================================================

const POST_HALF = 0.16
const POST_HEIGHT = 4.6
const BEAM_DROP = 0.25
const FLAG_H = 2.6 //     chute/ascent pennant post height
const TALL_H = 5.2 //     launch / landing marker height

const TIMBER = new THREE.Color('#6B4F35')
const TIMBER_LIT = new THREE.Color('#8A6A48')
const CREAM = new THREE.Color('#D8C9A8')
const CHAR = new THREE.Color('#2E2A27')
const FLAG_WARM = new THREE.Color('#E08A3C') //  warm pennant, pops in the golden light
const FLAG_CREAM = new THREE.Color('#E9DCBB')

/** Gate post colliders, consumed by Colliders.tsx - reachable geometry is solid. */
export const RIM_RUN_GATE_POSTS = (() => {
  const posts: { x: number; y: number; z: number; rotY: number; halfX: number; halfY: number; halfZ: number }[] = []
  for (const g of getRimRunGates()) {
    for (const side of [1, -1]) {
      const lat = (g.halfGap + POST_HALF) * side
      const x = g.x + g.tdx * lat
      const z = g.z + g.tdz * lat
      const y = getTerrainHeight(x, z)
      posts.push({
        x,
        y: y + POST_HEIGHT / 2,
        z,
        rotY: Math.atan2(g.rdx, g.rdz),
        halfX: POST_HALF,
        halfY: POST_HEIGHT / 2,
        halfZ: POST_HALF,
      })
    }
  }
  return posts
})()

/** A single oriented box pushed into shared arrays. Mirrors RidgeArches.tsx. */
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
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
    [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
    [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
    [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
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

const XR = new THREE.Vector3(1, 0, 0)
const ZF = new THREE.Vector3(0, 0, 1)

/** A slim post with a single triangular pennant near the top. Cheap - drives the "flags" read. */
function flagPost(pos: number[], cols: number[], x: number, z: number, height: number, warm: boolean): void {
  const g = getTerrainHeight(x, z)
  box(pos, cols, x, g + height / 2, z, 0.1, height / 2, 0.1, XR, ZF, TIMBER, TIMBER_LIT)
  // a little pennant: a flat quad hanging off the top, two colours alternating down the line
  const c = warm ? FLAG_WARM : FLAG_CREAM
  const py = g + height - 0.35
  const p0 = [x, py + 0.4, z]
  const p1 = [x + 0.9, py + 0.15, z]
  const p2 = [x, py - 0.1, z]
  for (const p of [p0, p1, p2, p0, p2, p1]) {
    pos.push(p[0], p[1], p[2])
    cols.push(c.r, c.g, c.b)
  }
}

function buildGate(pos: number[], cols: number[], gx: number, gz: number, rdx: number, rdz: number, tdx: number, tdz: number, halfGap: number): void {
  const right = new THREE.Vector3(tdx, 0, tdz) //          across the gate (the gap)
  const fwd = new THREE.Vector3(rdx, 0, rdz) //            along the thread (down the chute)
  const g0 = getTerrainHeight(gx + tdx * halfGap, gz + tdz * halfGap)
  const g1 = getTerrainHeight(gx - tdx * halfGap, gz - tdz * halfGap)
  const gTop = Math.max(g0, g1) + POST_HEIGHT
  for (const side of [1, -1]) {
    const lat = (halfGap + POST_HALF) * side
    const px = gx + tdx * lat
    const pz = gz + tdz * lat
    const g = getTerrainHeight(px, pz)
    box(pos, cols, px, g + POST_HEIGHT / 2, pz, POST_HALF, POST_HEIGHT / 2, POST_HALF, right, fwd, TIMBER, TIMBER_LIT)
  }
  // crossbeam + checker banner, echoing the start gantry and the ridge arches
  box(pos, cols, gx, gTop - BEAM_DROP, gz, halfGap + POST_HALF, 0.2, 0.28, right, fwd, TIMBER, TIMBER_LIT)
  const banners = 10
  const bw = (halfGap + POST_HALF) / banners
  for (let i = 0; i < banners; i++) {
    const lat = -(halfGap + POST_HALF) + (i * 2 + 1) * bw
    const c = i % 2 === 0 ? CREAM : CHAR
    box(pos, cols, gx + tdx * lat, gTop - BEAM_DROP - 0.55, gz + tdz * lat, bw, 0.3, 0.04, right, fwd, c, c)
  }
}

function buildMarkers(): THREE.BufferGeometry {
  const pos: number[] = []
  const cols: number[] = []
  const runs = getAirRuns()
  const gates = getRimRunGates()

  for (let r = 0; r < runs.length; r++) {
    const run = runs[r]
    const g = gates[r]

    // entrance gate on the pad
    buildGate(pos, cols, g.x, g.z, g.rdx, g.rdz, g.tdx, g.tdz, g.halfGap)

    // pennant line down the chute (both sides, at the lane edge)
    const chuteLen = Math.hypot(run.lx - run.padx, run.lz - run.padz)
    const nChute = Math.max(3, Math.round(chuteLen / 15))
    const edge = run.laneHalf + 0.7
    for (let i = 0; i <= nChute; i++) {
      const t = i / nChute
      const cx = run.padx + (run.lx - run.padx) * t
      const cz = run.padz + (run.lz - run.padz) * t
      flagPost(pos, cols, cx + run.tdx * edge, cz + run.tdz * edge, FLAG_H, i % 2 === 0)
      flagPost(pos, cols, cx - run.tdx * edge, cz - run.tdz * edge, FLAG_H, i % 2 === 1)
    }

    // sparser pennants up the ascent leg (one side is enough to lead the eye up)
    const ascLen = Math.hypot(run.padx - run.aex, run.padz - run.aez)
    const nAsc = Math.max(3, Math.round(ascLen / 26))
    for (let i = 1; i < nAsc; i++) {
      const t = i / nAsc
      const ax = run.aex + (run.padx - run.aex) * t
      const az = run.aez + (run.padz - run.aez) * t
      flagPost(pos, cols, ax + run.tdx * edge, az + run.tdz * edge, FLAG_H, i % 2 === 0)
    }

    // tall markers flanking the launch kicker - the "send it" gate
    for (const side of [1, -1]) {
      flagPost(pos, cols, run.lx + run.tdx * (run.laneHalf + 1.4) * side, run.lz + run.tdz * (run.laneHalf + 1.4) * side, TALL_H, side > 0)
    }
    // and a pair at the far end of the landing runway (where to aim the arc)
    for (const side of [1, -1]) {
      flagPost(pos, cols, run.lex + run.tdx * (run.landHalf - 1) * side, run.lez + run.tdz * (run.landHalf - 1) * side, TALL_H, side < 0)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

export function RimRuns() {
  const geo = useMemo(buildMarkers, [])
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.85} metalness={0} flatShading />
    </mesh>
  )
}
