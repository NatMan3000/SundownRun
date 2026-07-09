import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { makeMountainGeometry } from './geometry'

// ============================================================
// The far ridges. See the long note in geometry.ts for why they look the way they do -
// the short version is that they dissolve by ALPHA, not by fogging to a solid tone.
//
// The material is unlit and knows nothing about the scene fog. It draws a baked colour at
// a baked alpha, and because alpha is zero at every summit, the silhouette IS the sky
// behind it - at every bearing, at every elevation, no matter what the sky gradient is
// doing there. There is no top edge to find.
//
// depthTest ON, depthWrite OFF:
//   - ON, so the rim (real geometry at 300-900 m) occludes them exactly as a valley wall
//     should occlude a range behind it;
//   - OFF, so the three rings blend into each other instead of clipping. They are emitted
//     far-first, and painter's order does the layering.
//
// The mesh rides with the camera in x/z, which keeps every ring at a constant distance:
// never clipped by the 1200 m far plane, visible from everywhere, and always wearing the
// same amount of haze.
// ============================================================

const vertexShader = /* glsl */ `
attribute vec3 aCol;
attribute float aAlpha;
varying vec3 vCol;
varying float vA;
void main() {
  vCol = aCol;
  vA = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

const fragmentShader = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  gl_FragColor = vec4( vCol, vA );
  // The same two chunks the sky dome uses, so both take the identical output path and the
  // blend between them cannot drift.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function Mountains() {
  const ref = useRef<THREE.Mesh>(null!)
  const geometry = useMemo(() => makeMountainGeometry(), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        fog: false,
        side: THREE.FrontSide,
        blending: THREE.NormalBlending,
      }),
    []
  )

  useFrame((state) => {
    // x/z only: the ridge line has to stay put on the horizon when the car climbs.
    ref.current.position.set(state.camera.position.x, 0, state.camera.position.z)
  })

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      material={material}
      // first of the transparent queue: behind tyre smoke, skid dust and the sun flare
      renderOrder={-900}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  )
}
