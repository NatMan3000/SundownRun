import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CONFIG } from '../core/config'
import { getSunDirection } from '../world/sun'

// ============================================================
//  THE SUN, AS AN OBJECT
// ------------------------------------------------------------
//  The sky dome paints a sun disc, but a painted disc is just a
//  bright pixel: it cannot be occluded by a hill and it barely
//  clears the bloom threshold. This is a real billboard sitting
//  at the sun's direction, emitting genuinely-above-1.0 radiance
//  into the half-float buffer.
//
//  Two consequences, both wanted:
//    - bloom finds it. The sun flares, and it is the ONLY thing
//      in a normally-lit frame that does.
//    - it depth-tests. Crest a hill and the sun rises out from
//      behind it; drop into the valley and it is gone.
//
//  It rides the camera, so it never falls outside the far plane,
//  and it is billboarded in the vertex shader so it costs one
//  draw call and no CPU work.
// ============================================================

const vertexShader = /* glsl */ `
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uGlow;
varying vec2 vUv;
void main() {
  float d = length( vUv - 0.5 ) * 2.0;
  if ( d > 1.0 ) discard;

  // hard-ish core, then a wide halo that falls off fast enough to
  // stay a sun and not become a fog bank
  float core = 1.0 - smoothstep( 0.0, 0.30, d );
  float halo = pow( 1.0 - d, 3.2 );

  vec3 col = uCore * core + uGlow * halo;
  float a = clamp( core + halo * 0.55, 0.0, 1.0 );
  gl_FragColor = vec4( col, a );
  #include <colorspace_fragment>
}
`

/** Sits just inside the sky dome (0.9 * drawDistance) so it never clips. */
const DISTANCE = CONFIG.drawDistanceM * 0.86

const _sun = /* @__PURE__ */ getSunDirection()

export function SunFlare() {
  const ref = useRef<THREE.Mesh>(null)

  const uniforms = useMemo(
    () => ({
      uSize: { value: DISTANCE * 0.055 },
      // Above 1.0 on purpose. This is what the bloom threshold is set against.
      uCore: { value: new THREE.Vector3(3.6, 3.1, 2.35) },
      uGlow: { value: new THREE.Vector3(1.25, 0.72, 0.34) },
    }),
    []
  )

  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return
    mesh.position.copy(state.camera.position).addScaledVector(_sun, DISTANCE)
  })

  return (
    <mesh ref={ref} renderOrder={-500} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        fog={false}
      />
    </mesh>
  )
}
