import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { makeRockGeometry } from './geometry'
import { getScatter } from './scatter'

// One instanced species. Shape variety comes from per-instance non-uniform scale
// and rotation, so a single 80-triangle boulder never reads as a repeat.

export function Rocks() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const { rocks } = getScatter()
  const geometry = useMemo(() => makeRockGeometry(), [])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    []
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    const o = new THREE.Object3D()
    const col = new THREE.Color()
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i]
      // sink each rock a little so it sits in the ground rather than on it
      o.position.set(r.x, r.y - r.sy * 0.32, r.z)
      o.rotation.set(r.tilt, r.rotY, r.tilt * 0.6)
      o.scale.set(r.sx, r.sy, r.sz)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      const v = 0.86 + r.shade * 0.26
      col.setRGB(v * 1.03, v, v * 0.93)
      mesh.setColorAt(i, col)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [rocks])

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, rocks.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}
