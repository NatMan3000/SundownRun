import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { GradeEffect } from './grade'

// ============================================================
//  POST STACK
// ------------------------------------------------------------
//  The scene renders into a half-float buffer, so radiance is
//  allowed to exceed 1.0 - the sun disc, the headlights and the
//  brake lights genuinely are brighter than white. Everything
//  downstream depends on that being true:
//
//    RenderPass   HDR linear
//    Bloom        threshold 1.0 -> only real highlights bloom.
//                 A threshold below 1 makes lit grass glow, and
//                 a glowing frame reads as a bug, not as light.
//    ToneMapping  ACES filmic. Rolls the sun off to white
//                 instead of clipping it to a flat disc.
//    Grade        split-tone (see grade.ts)
//    Chromatic    ~0.4 px at the frame edge only, radially
//                 modulated. Below the threshold of noticing,
//                 above the threshold of feeling like a lens.
//    Vignette     gentle. Sits the eye on the car.
//    SMAA         last, on the finished LDR image.
//
//  EffectComposer merges consecutive non-convolution effects into
//  ONE fullscreen pass, so the whole tail (tone map -> vignette)
//  costs a single texture read. Bloom and SMAA are convolution
//  effects and each take a pass of their own. Three passes total.
//
//  EffectComposer also parks renderer.toneMapping at NoToneMapping
//  while it is mounted, which is why tone mapping has to live in
//  here and not on the renderer - otherwise the frame gets ACES'd
//  twice and the highlights go milky.
// ============================================================

function Grade() {
  const effect = useMemo(
    () => new GradeEffect({ shadowLift: 0.8, contrast: 0.34, saturation: 1.1, olive: 0.9 }),
    []
  )
  useEffect(() => () => effect.dispose(), [effect])
  return <primitive object={effect} dispose={null} />
}

export function Effects() {
  // ChromaticAberrationEffect wants a real Vector2, and a fresh one every
  // render would rebuild the effect.
  const aberration = useMemo(() => new THREE.Vector2(0.00042, 0.00042), [])
  const gl = useThree((s) => s.gl)

  // Every pass calls renderer.render(), and three resets its draw-call counters
  // on each one. Left alone, window.__game.renderInfo() reports the two
  // triangles of the last fullscreen quad. Take the reset over manually so the
  // number a checker reads is the whole frame: scene + shadow map + post.
  useEffect(() => {
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = true
    }
  }, [gl])

  useFrame(() => gl.info.reset(), 0)

  return (
    <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
      <Bloom
        mipmapBlur
        luminanceThreshold={1.05}
        luminanceSmoothing={0.35}
        intensity={0.75}
        radius={0.66}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Grade />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={aberration}
        radialModulation
        modulationOffset={0.42}
      />
      <Vignette offset={0.28} darkness={0.62} eskil={false} />
      <SMAA />
    </EffectComposer>
  )
}
