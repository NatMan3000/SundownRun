// ============================================================
//  TEMP - remove when the world worker's terrain colliders land.
// ------------------------------------------------------------
//  The drive system needs SOMETHING to raycast against. Until the
//  world mounts its heightfield, this puts a static trimesh under
//  the road corridor, sampled from the same getTerrainHeight() the
//  real terrain will use - so the car drives on the identical
//  surface and none of the handling tuning changes when it goes.
//
//  Flip TEMP_GROUND to false (Vehicle.tsx) once world colliders
//  exist. Leaving both on is harmless for the suspension raycasts
//  (they hit the nearer of two coincident surfaces) but wastes
//  ~11k static triangles and doubles chassis contact work.
// ============================================================

import { useMemo } from 'react'
import * as THREE from 'three'
import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import { ROAD_LENGTH, getTerrainHeight, roadSpline } from '../core/terrain'

const SEGMENTS = 1000 // along the road
const LANES = 6 //      across the corridor
const HALF_WIDTH = 45 // metres either side of the centre line, curvature permitting

function buildCorridor(): { vertices: Float32Array; indices: Uint32Array } {
  const cols = LANES + 1
  const vertices = new Float32Array(SEGMENTS * cols * 3)
  const indices = new Uint32Array(SEGMENTS * LANES * 6)

  const p = new THREE.Vector3()
  const tan = new THREE.Vector3()
  const tanNext = new THREE.Vector3()
  const ds = ROAD_LENGTH / SEGMENTS

  let v = 0
  for (let i = 0; i < SEGMENTS; i++) {
    const t = i / SEGMENTS
    roadSpline.getPointAt(t, p)
    roadSpline.getTangentAt(t, tan)
    roadSpline.getTangentAt((i + 1) / SEGMENTS, tanNext)

    // side vector = tangent x up, flattened
    const sx = -tan.z
    const sz = tan.x
    const len = Math.hypot(sx, sz) || 1

    // A ribbon wider than the local turning radius folds inside-out and the
    // physics explodes on the crumpled triangles. Clamp the width to the corner.
    const dTheta = Math.acos(Math.min(1, Math.max(-1, tan.dot(tanNext))))
    const radius = ds / Math.max(dTheta, 1e-5)
    const half = Math.min(HALF_WIDTH, radius * 0.6)

    for (let j = 0; j < cols; j++) {
      const off = (j / LANES - 0.5) * 2 * half
      const x = p.x + (sx / len) * off
      const z = p.z + (sz / len) * off
      vertices[v++] = x
      vertices[v++] = getTerrainHeight(x, z)
      vertices[v++] = z
    }
  }

  let k = 0
  for (let i = 0; i < SEGMENTS; i++) {
    const next = (i + 1) % SEGMENTS // closed loop
    for (let j = 0; j < LANES; j++) {
      const a = i * cols + j
      const b = next * cols + j
      const c = next * cols + j + 1
      const d = i * cols + j + 1
      indices[k++] = a
      indices[k++] = b
      indices[k++] = c
      indices[k++] = a
      indices[k++] = c
      indices[k++] = d
    }
  }
  return { vertices, indices }
}

export function TempGround() {
  const mesh = useMemo(() => {
    const m = buildCorridor()
    if (import.meta.env.DEV) {
      console.info(
        `[vehicle] TEMP ground collider ON - ${(m.indices.length / 3) | 0} tris over ${ROAD_LENGTH.toFixed(0)}m of road`
      )
    }
    return m
  }, [])

  return (
    <RigidBody type="fixed" colliders={false}>
      <TrimeshCollider args={[mesh.vertices, mesh.indices]} friction={0.6} restitution={0.02} />
    </RigidBody>
  )
}
