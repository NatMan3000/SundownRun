import { useMemo } from 'react'
import * as THREE from 'three'
import { fbm2D, hash2D } from '../core/random'
import { RIM_RISE, playgroundWear, rimHeightAt, roadDistance } from '../core/terrain'
import { TERRAIN_RES, getHeightLattice, latticeCoord, latticeNormal } from './heightfield'
import { makeTerrainDetailTexture } from './textures'

// ============================================================
// One mesh, one draw call. Colour comes from vertex colours
// multiplied by a tiling grain texture, so the ground is never a
// flat monotone. Four things are painted here:
//
//   1. the bowl - sun-bleached gold blended into olive by slope,
//      altitude and patch noise;
//   2. the rim - exposed rock where it is steep, scree on the
//      mid slopes, dry grass where it is shallow, all broken up
//      by noise so no band ever reads as a band;
//   3. AERIAL PERSPECTIVE. The rim's upper reaches are 800 m+
//      away, but the fog rig only reaches 0.05 at that distance,
//      so a 180 m wall of rock stayed crisp against the sky and
//      erased the third depth plane. The fix is to bake the haze
//      in: colour recedes toward the mountain violet as the rim
//      climbs, so the ridge dissolves into the layer behind it
//      instead of stacking a second wall in front of it.
//   4. the playground landforms - worn to dirt where the tyres go.
//
// Its vertices ARE the physics heightfield's vertices - see
// heightfield.ts. The car lands on what you can see.
// ============================================================

const N = TERRAIN_RES + 1
const DETAIL_TILE = 14 // metres per repeat of the grain texture

const GOLD = new THREE.Color('#C9A85C')
const OLIVE = new THREE.Color('#7A8B4F')
const SHADE = new THREE.Color('#5C6B3E')
const DUST = new THREE.Color('#8A7A5E')
/** `slope` is 1 - normal.y: 0.13 is a 30 deg hillside, 0.33 is the 48 deg rim face. */
const ROCK_DARK = new THREE.Color('#524A3D')
const ROCK_LIGHT = new THREE.Color('#7B7264')
const SCREE = new THREE.Color('#8B8272')
/** Where a car has ridden the landforms often enough to wear them down. */
const DIRT = new THREE.Color('#7E6647')
/** The mountain layer's own colour. The rim fades into it rather than in front of it. */
const HAZE = new THREE.Color('#98A0BC')

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function buildGeometry(): THREE.BufferGeometry {
  const h = getHeightLattice()
  const position = new Float32Array(N * N * 3)
  const normal = new Float32Array(N * N * 3)
  const color = new Float32Array(N * N * 3)
  const uv = new Float32Array(N * N * 2)
  const nrm: [number, number, number] = [0, 1, 0]
  const col = new THREE.Color()
  const rock = new THREE.Color()

  for (let iz = 0; iz < N; iz++) {
    const z = latticeCoord(iz)
    for (let ix = 0; ix < N; ix++) {
      const x = latticeCoord(ix)
      const y = h[ix + iz * N]
      const v = ix + iz * N

      position[v * 3] = x
      position[v * 3 + 1] = y
      position[v * 3 + 2] = z

      latticeNormal(ix, iz, nrm)
      normal[v * 3] = nrm[0]
      normal[v * 3 + 1] = nrm[1]
      normal[v * 3 + 2] = nrm[2]

      uv[v * 2] = x / DETAIL_TILE
      uv[v * 2 + 1] = z / DETAIL_TILE

      // 1 = vertical, 0 = flat
      const slope = 1 - nrm[1]
      const rim = rimHeightAt(x, z)
      const patch = fbm2D(x * 0.0035 + 55.1, z * 0.0035 + 91.7, 3)
      let t = smoothstep(0.44, 0.62, patch)
      t += slope * 0.75 //            grass survives on the shaded steeps
      // Exposed high ground bleaches to gold - but measure that height against the
      // BOWL, not against sea level. Left as `y` the 135 m rim clamped t to zero and
      // the whole thing came out one flat custard slope, which is what got rejected.
      t -= (y - rim - 4) * 0.0045
      t = Math.min(1, Math.max(0, t))

      col.copy(GOLD).lerp(OLIVE, t)
      col.lerp(SHADE, smoothstep(0.5, 0.95, slope) * 0.65)

      // ---- the rim ----
      if (rim > 1) {
        // Two noise fields, so the rock/grass boundary wanders instead of contouring.
        const nRock = fbm2D(x * 0.019 + 401.7, z * 0.019 + 13.3, 3)
        const nTone = fbm2D(x * 0.047 + 88.2, z * 0.047 + 51.9, 2)
        const climbing = smoothstep(3, 30, rim)

        const rockAmt = Math.min(
          1,
          Math.max(0, smoothstep(0.13, 0.32, slope) + (nRock - 0.5) * 0.55)
        )
        rock.copy(ROCK_DARK).lerp(ROCK_LIGHT, nTone)
        col.lerp(rock, rockAmt * climbing)

        // scree spills down the shallower ground between the buttresses
        col.lerp(SCREE, smoothstep(0.08, 0.22, slope) * (1 - rockAmt) * 0.5 * climbing)

        // aerial perspective - the whole point of this block
        col.lerp(HAZE, smoothstep(RIM_RISE * 0.30, RIM_RISE * 0.98, rim) * 0.34)
      }

      // ---- the playground landforms ----
      const wear = playgroundWear(x, z)
      if (wear > 0) col.lerp(DIRT, wear * 0.82)

      // a dusty verge, not a 25 m dirt shoulder: gone by 16 m, and never full strength
      const d = roadDistance(x, z, 18)
      if (d < 18) col.lerp(DUST, (1 - smoothstep(8, 16, d)) * 0.85)

      const jitter = 0.9 + 0.2 * hash2D(x * 0.71, z * 0.71)
      color[v * 3] = col.r * jitter
      color[v * 3 + 1] = col.g * jitter
      color[v * 3 + 2] = col.b * jitter
    }
  }

  const index = new Uint32Array(TERRAIN_RES * TERRAIN_RES * 6)
  let o = 0
  for (let iz = 0; iz < TERRAIN_RES; iz++) {
    for (let ix = 0; ix < TERRAIN_RES; ix++) {
      const a = ix + iz * N
      const b = a + 1
      const c = a + N
      const d = c + 1
      index[o++] = a
      index[o++] = c
      index[o++] = b
      index[o++] = b
      index[o++] = c
      index[o++] = d
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  g.setAttribute('color', new THREE.BufferAttribute(color, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(new THREE.BufferAttribute(index, 1))
  g.computeBoundingSphere()
  return g
}

export function Terrain() {
  const geometry = useMemo(buildGeometry, [])
  const detail = useMemo(() => makeTerrainDetailTexture(), [])

  return (
    <mesh geometry={geometry} receiveShadow castShadow={false}>
      <meshStandardMaterial
        vertexColors
        map={detail}
        roughness={0.97}
        metalness={0}
        dithering
      />
    </mesh>
  )
}
