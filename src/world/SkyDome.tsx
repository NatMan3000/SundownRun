import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CONFIG } from '../core/config'
import { getSunDirection } from './sun'
import { makeCloudTexture } from './textures'

// ============================================================
// Golden-hour sky. One dome, one draw call, everything analytic.
// The dome rides with the camera so it can never clip the far
// plane, and it writes no depth - it is simply painted first.
// ============================================================

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uSunDir;
uniform vec2 uSunAz;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHorizonHot;
uniform vec3 uAntiSun;
uniform vec3 uGround;
uniform vec3 uSunDisc;
uniform vec3 uSunGlow;
uniform vec3 uCloudLit;
uniform vec3 uCloudShadow;
uniform sampler2D uCloud;
uniform vec2 uCloudOffset;
varying vec3 vDir;

void main() {
  vec3 d = normalize( vDir );
  float up = clamp( d.y, 0.0, 1.0 );

  // vertical gradient. The 0.42 exponent keeps the warm band low and wide.
  vec3 col = mix( uHorizon, uZenith, pow( up, 0.42 ) );

  // where we are looking relative to the sun, ignoring elevation
  float az = dot( normalize( d.xz + vec2( 1e-5 ) ), uSunAz );
  float lowBand = 1.0 - smoothstep( 0.0, 0.40, up );
  col = mix( col, uHorizonHot, smoothstep( -0.15, 1.0, az ) * lowBand * 0.80 );
  float antiBand = 1.0 - smoothstep( 0.0, 0.55, up );
  col = mix( col, uAntiSun, smoothstep( -0.10, -1.0, az ) * antiBand * 0.50 );

  float cosA = dot( d, uSunDir );

  // the disc goes under the clouds, so a streak can drift across it
  float ang = acos( clamp( cosA, -1.0, 1.0 ) );
  col = mix( col, uSunDisc * 1.35, 1.0 - smoothstep( 0.020, 0.030, ang ) );

  if ( d.y > 0.004 ) {
    // project the ray onto a flat cloud deck. The +0.10 keeps the horizon finite.
    vec2 cp = d.xz / ( d.y + 0.10 );
    vec2 cuv = cp * 0.045 + uCloudOffset;
    float c1 = texture2D( uCloud, cuv * 0.30 ).r;
    float c2 = texture2D( uCloud, cuv * 0.85 + vec2( 0.37, 0.19 ) ).r;
    float cover = smoothstep( 0.50, 0.86, c1 * 0.72 + c2 * 0.28 );
    cover *= smoothstep( 0.02, 0.20, d.y );        // no smeared streaks at the horizon
    cover *= 1.0 - smoothstep( 0.50, 0.92, d.y );  // thin out straight overhead
    vec3 cloudCol = mix( uCloudShadow, uCloudLit, pow( max( az, 0.0 ), 1.6 ) );
    col = mix( col, cloudCol, cover * 0.70 );
  }

  // glow sits on top of the clouds so the sun burns through them
  col += uSunGlow * pow( max( cosA, 0.0 ), 30.0 ) * 0.55;
  col += uSunGlow * pow( max( cosA, 0.0 ), 5.0 ) * 0.14;

  // below the horizon, fade to warm haze so the terrain edge never shows the void
  col = mix( uGround, col, smoothstep( -0.09, 0.005, d.y ) );

  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function SkyDome() {
  const ref = useRef<THREE.Mesh>(null!)
  const cloud = useMemo(() => makeCloudTexture(), [])

  const uniforms = useMemo(() => {
    const sun = getSunDirection()
    return {
      uSunDir: { value: sun },
      uSunAz: { value: new THREE.Vector2(sun.x, sun.z).normalize() },
      uZenith: { value: new THREE.Color('#5B7FB4') },
      uHorizon: { value: new THREE.Color('#FFC98A') },
      uHorizonHot: { value: new THREE.Color('#FF9E5E') },
      uAntiSun: { value: new THREE.Color('#B8A0C8') },
      uGround: { value: new THREE.Color('#C0A183') },
      uSunDisc: { value: new THREE.Color('#FFF3DC') },
      uSunGlow: { value: new THREE.Color('#FFC08A') },
      uCloudLit: { value: new THREE.Color('#FFD9B0') },
      uCloudShadow: { value: new THREE.Color('#9C93AE') },
      uCloud: { value: cloud },
      uCloudOffset: { value: new THREE.Vector2() },
    }
  }, [cloud])

  useFrame((state, delta) => {
    ref.current.position.copy(state.camera.position)
    uniforms.uCloudOffset.value.x += delta * 0.0032
    uniforms.uCloudOffset.value.y += delta * 0.0011
  })

  const radius = CONFIG.drawDistanceM * 0.9

  return (
    <mesh ref={ref} scale={radius} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[1, 40, 24]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}
