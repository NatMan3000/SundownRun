import { useMemo } from 'react'
import { makeMountainGeometry } from './geometry'

// Three concentric ridge rings merged into one draw call, ~6.7k triangles. They sit
// 900-1170 m out, so the near ones are 300 m from the car and read as real geometry,
// while the far side of the ring is past the fog wall and has already dissolved into
// haze before the far plane ever clips it. Their colour is pre-mixed toward the haze
// by ring, so depth reads even before the fog lands.

export function Mountains() {
  const geometry = useMemo(() => makeMountainGeometry(), [])

  return (
    <mesh geometry={geometry} frustumCulled={false} castShadow={false} receiveShadow={false}>
      <meshLambertMaterial
        vertexColors
        flatShading
        emissive="#2A3050"
        emissiveIntensity={0.55}
      />
    </mesh>
  )
}
