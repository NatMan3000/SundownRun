import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { makeTreeGeometry, type TreeSpecies } from './geometry'
import { getScatter, type TreeInstance } from './scatter'
import { windUniforms } from './wind'

// ============================================================
// One InstancedMesh per species (constitution, section 2). Sway and
// the draw-distance collapse both live in the vertex shader, driven
// by uniforms - nothing here touches a matrix after mount.
// ============================================================

const SWAY_VERTEX_HEAD = /* glsl */ `
#include <common>
uniform float uTime;
uniform vec2 uWind;
uniform vec2 uFade;
attribute float aSway;
`

const SWAY_VERTEX_BODY = /* glsl */ `
vec3 transformed = vec3( position );
#ifdef USE_INSTANCING
  vec3 iOrigin = vec3( instanceMatrix[ 3 ][ 0 ], instanceMatrix[ 3 ][ 1 ], instanceMatrix[ 3 ][ 2 ] );
#else
  vec3 iOrigin = vec3( 0.0 );
#endif
// two detuned sines give a gust that never reads as a loop
float phase = iOrigin.x * 0.11 + iOrigin.z * 0.09;
float gust = sin( uTime * 0.9 + phase ) * 0.6 + sin( uTime * 1.7 + phase * 2.3 ) * 0.25;
transformed.x += gust * aSway * uWind.x * 1.3;
transformed.z += gust * aSway * uWind.y * 1.3;
// collapse into the trunk base at the fog wall instead of popping out of existence
transformed *= 1.0 - smoothstep( uFade.x, uFade.y, distance( cameraPosition, iOrigin ) );
`

function makeFoliageMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime
    shader.uniforms.uWind = windUniforms.uWind
    shader.uniforms.uFade = windUniforms.uTreeFade
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', SWAY_VERTEX_HEAD)
      .replace('#include <begin_vertex>', SWAY_VERTEX_BODY)
  }
  m.customProgramCacheKey = () => 'foliage-sway'
  return m
}

function Species({ species, list }: { species: TreeSpecies; list: TreeInstance[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geometry = useMemo(() => makeTreeGeometry(species), [species])
  const material = useMemo(makeFoliageMaterial, [])

  useLayoutEffect(() => {
    const mesh = ref.current
    const o = new THREE.Object3D()
    const col = new THREE.Color()
    for (let i = 0; i < list.length; i++) {
      const t = list[i]
      o.position.set(t.x, t.y, t.z)
      o.rotation.set(0, t.rotY, 0)
      o.scale.setScalar(t.scale)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      // per-instance multiplier: some trees drier, some deeper green
      const v = 0.84 + t.tint * 0.32
      col.setRGB(v * (0.95 + t.tint * 0.1), v, v * (0.98 - t.tint * 0.12))
      mesh.setColorAt(i, col)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [list])

  if (list.length === 0) return null

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, list.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}

export function Trees() {
  const { treesA, treesB, treesC } = getScatter()
  return (
    <>
      <Species species="broadleaf" list={treesA} />
      <Species species="slim" list={treesB} />
      <Species species="autumn" list={treesC} />
    </>
  )
}
