import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { makeGrassGeometry } from './geometry'
import { getScatter } from './scatter'
import { windUniforms } from './wind'

// ============================================================
// 24k wind-swayed tufts hugging the road corridor, one instanced
// shader mesh. The sway is a vertex-shader function of uTime, and
// tufts past the fade distance shrink to a point, so only the few
// hundred within ~130 m ever cost a fragment.
// ============================================================

const GRASS_VERTEX_HEAD = /* glsl */ `
#include <common>
uniform float uTime;
uniform vec2 uWind;
uniform vec2 uFade;
attribute float aBlade;
`

const GRASS_VERTEX_BODY = /* glsl */ `
vec3 transformed = vec3( position );
#ifdef USE_INSTANCING
  vec3 iOrigin = vec3( instanceMatrix[ 3 ][ 0 ], instanceMatrix[ 3 ][ 1 ], instanceMatrix[ 3 ][ 2 ] );
#else
  vec3 iOrigin = vec3( 0.0 );
#endif
float phase = iOrigin.x * 0.31 + iOrigin.z * 0.23;
float sway = sin( uTime * 1.7 + phase ) * 0.55 + sin( uTime * 3.1 + phase * 1.7 ) * 0.20;
// aBlade^2: the root stays planted, the tip does the moving
float bend = aBlade * aBlade;
transformed.x += sway * bend * uWind.x;
transformed.z += sway * bend * uWind.y;
transformed *= 1.0 - smoothstep( uFade.x, uFade.y, distance( cameraPosition, iOrigin ) );
`

function makeGrassMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime
    shader.uniforms.uWind = windUniforms.uWind
    shader.uniforms.uFade = windUniforms.uGrassFade
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', GRASS_VERTEX_HEAD)
      .replace('#include <begin_vertex>', GRASS_VERTEX_BODY)
    // Blades are single quads whose normal points straight up, so they light like the
    // ground they grow from. Undo three's back-face normal flip or half of every tuft
    // renders black.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );'
    )
  }
  m.customProgramCacheKey = () => 'grass-sway'
  return m
}

export function Grass() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const { grass, grassCount } = getScatter()
  const geometry = useMemo(() => makeGrassGeometry(), [])
  const material = useMemo(makeGrassMaterial, [])

  useLayoutEffect(() => {
    const mesh = ref.current
    const o = new THREE.Object3D()
    const col = new THREE.Color()
    for (let i = 0; i < grassCount; i++) {
      const b = i * 6
      const tint = grass[b + 5]
      const s = grass[b + 4]
      o.position.set(grass[b], grass[b + 1], grass[b + 2])
      o.rotation.set(0, grass[b + 3], 0)
      // the geometry is a unit-height tuft: 0.21 m to 0.82 m of actual grass
      o.scale.set(s * 0.75, s * (0.34 + tint * 0.26), s * 0.75)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      // dry gold tufts through to green ones, echoing the ground beneath. Kept close
      // to 1.0 - this multiplies the vertex colour, it is not a brightness knob.
      col.setRGB(0.86 + tint * 0.28, 0.94 + tint * 0.06, 0.72 + (1 - tint) * 0.18)
      mesh.setColorAt(i, col)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [grass, grassCount])

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, grassCount]}
      castShadow={false}
      receiveShadow
      frustumCulled={false}
    />
  )
}
