import { useMemo } from 'react'
import * as THREE from 'three'
import { fbm2D, hash2D } from '../core/random'
import { roadDistance } from '../core/terrain'
import { TERRAIN_RES, getHeightLattice, latticeCoord, latticeNormal } from './heightfield'
import { makeTerrainDetailTexture } from './textures'

// ============================================================
// One mesh, one draw call, ~295k triangles. Colour comes from
// vertex colours (sun-bleached gold blended into olive by slope,
// altitude and patch noise) multiplied by a tiling grain texture,
// so the ground is never a flat monotone.
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
/** Nothing grows on the rim face. `slope` is 1 - normal.y, so 0.67 is the 71-degree wall. */
const ROCK = new THREE.Color('#7A6E5E')

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
      const patch = fbm2D(x * 0.0035 + 55.1, z * 0.0035 + 91.7, 3)
      let t = smoothstep(0.44, 0.62, patch)
      t += slope * 0.75 //            grass survives on the shaded steeps
      t -= (y - 4) * 0.0045 //        exposed high ground bleaches to gold
      t = Math.min(1, Math.max(0, t))

      col.copy(GOLD).lerp(OLIVE, t)
      col.lerp(SHADE, smoothstep(0.5, 0.95, slope) * 0.65)
      // The bowl's wall is bare rock. Rolling hills top out near 0.05, road embankments
      // near 0.02, so nothing but the rim face ever reaches this ramp.
      col.lerp(ROCK, smoothstep(0.42, 0.7, slope))

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
