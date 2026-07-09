import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { makeMountainGeometry } from './geometry'

// Three ridge rings merged into one draw call, ~6.7k triangles. They ride with the
// camera in x/z, which keeps them a constant ~1 km away: never clipped by the far
// plane, always visible, and always sitting under the same 62-70% of fog. See the
// long note in geometry.ts for why they are unlit.
//
// Depth is ordinary, so the rim - real geometry, much nearer - occludes them exactly
// as a mountain range behind a valley wall should be occluded.

export function Mountains() {
  const ref = useRef<THREE.Mesh>(null!)
  const geometry = useMemo(() => makeMountainGeometry(), [])

  useFrame((state) => {
    // x/z only: the ridge line has to stay put on the horizon when the car climbs.
    ref.current.position.set(state.camera.position.x, 0, state.camera.position.z)
  })

  return (
    <mesh ref={ref} geometry={geometry} frustumCulled={false} castShadow={false} receiveShadow={false}>
      <meshBasicMaterial vertexColors fog={false} />
    </mesh>
  )
}
