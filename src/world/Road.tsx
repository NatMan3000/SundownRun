import { useMemo } from 'react'
import * as THREE from 'three'
import { ROAD_DENSE, ROAD_LENGTH, ROAD_RIBBON_HALF } from '../core/terrain'
import { makeRoadTexture } from './textures'

// ============================================================
// A ribbon lofted along the spline. 16 m wide: 9 m of asphalt with
// a 3.5 m dusty verge each side, flaring out through the hairpin.
//
// It sits 1.5 cm above the collider surface, which is itself the
// spline's own height - so the wheels touch exactly the plane the
// asphalt is drawn on. UVs run along arc length, a whole number of
// texture repeats around the loop, so the centre-line dashes keep
// an 8 m period and the seam is invisible.
// ============================================================

const STRIDE = 2 //     every second dense sample: stations ~1.9 m apart
const TILE_LENGTH = 24 // metres of road per texture repeat
const SURFACE_LIFT = 0.015

// Lateral columns as a fraction of the half-width. +/-0.5625 is the asphalt edge,
// which is where the texture switches from asphalt to dust.
const COLS = [-1, -0.78, -0.5625, -0.28, 0, 0.28, 0.5625, 0.78, 1]

function buildGeometry(): THREE.BufferGeometry {
  const D = ROAD_DENSE
  const stations = Math.floor(D.count / STRIDE)
  const rows = stations + 1 // the last row repeats the first, carrying the wrapped UV
  const cols = COLS.length
  const vRepeat = Math.max(1, Math.round(ROAD_LENGTH / TILE_LENGTH))

  const position = new Float32Array(rows * cols * 3)
  const uv = new Float32Array(rows * cols * 2)

  for (let r = 0; r < rows; r++) {
    const i = (r % stations) * STRIDE
    const arc = r * STRIDE * D.spacing
    const u = r / stations

    // periodic wobble: the ribbon's edge must not snap where the loop closes
    const wob =
      0.028 * Math.sin(u * Math.PI * 2 * 37) + 0.016 * Math.sin(u * Math.PI * 2 * 13 + 1.7)
    const half = (ROAD_RIBBON_HALF + D.flare[i]) * (1 + wob)

    const nx = D.tz[i] //  left/right normal in the xz plane
    const nz = -D.tx[i]
    const y = D.y[i] + SURFACE_LIFT

    for (let c = 0; c < cols; c++) {
      const lat = COLS[c] * half
      const v = r * cols + c
      position[v * 3] = D.x[i] + nx * lat
      position[v * 3 + 1] = y
      position[v * 3 + 2] = D.z[i] + nz * lat
      uv[v * 2] = (COLS[c] + 1) * 0.5
      uv[v * 2 + 1] = (arc / ROAD_LENGTH) * vRepeat
    }
  }

  const index = new Uint32Array(stations * (cols - 1) * 6)
  let o = 0
  for (let r = 0; r < stations; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c
      const b = a + 1
      const d = a + cols
      const e = d + 1
      index[o++] = a
      index[o++] = d
      index[o++] = b
      index[o++] = b
      index[o++] = d
      index[o++] = e
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(position, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(new THREE.BufferAttribute(index, 1))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

export function Road() {
  const geometry = useMemo(buildGeometry, [])
  const map = useMemo(() => makeRoadTexture(), [])

  return (
    <mesh geometry={geometry} receiveShadow castShadow={false}>
      <meshStandardMaterial
        map={map}
        roughness={0.85}
        metalness={0}
        dithering
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-2}
      />
    </mesh>
  )
}
