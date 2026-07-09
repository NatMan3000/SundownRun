// STUB - world worker replaces this file.
// Contract: renders terrain + road + vegetation + sky + mountains, and mounts
// the static physics colliders for the terrain / road corridor.
import { useMemo } from 'react'
import * as THREE from 'three'
import { WORLD_SIZE, getTerrainHeight } from '../core/terrain'

export function World() {
  const geometry = useMemo(() => {
    const res = 128
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, res, res)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, getTerrainHeight(pos.getX(i), pos.getZ(i)))
    }
    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#9a8b5a" />
    </mesh>
  )
}
