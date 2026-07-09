import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CONFIG } from '../core/config'
import { telemetry } from '../core/telemetry'
import { getSunDirection, SUN_COLOR } from '../world/sun'
import { buildSkyEnvironment } from './skyEnv'
import { SunFlare } from './SunFlare'

// ============================================================
//  THE GOLDEN HOUR RIG
// ------------------------------------------------------------
//  Four sources, and every one of them has a job:
//
//  1. SUN. One warm directional light, aimed from exactly the
//     direction world/sun.ts puts the disc in the sky - so the
//     shadows on the ground point away from the sun you can see.
//     It is the only shadow caster in the game (constitution s2).
//
//  2. SHADOW FRUSTUM. A 92 m ortho box that rides with the car.
//     A 2048 map over 184 m gives ~9 cm texels, which is sharp
//     enough for the wheels and cheap enough to redraw every
//     frame. The box is SNAPPED to whole texels in light space,
//     otherwise sub-texel drift makes every shadow edge crawl as
//     the car moves - the classic shimmer.
//
//  3. HEMISPHERE. Cool zenith over warm ground bounce. This is
//     what stops the shadowed side of a tree going black: at a
//     14 deg sun elevation, flat ground only catches a quarter of
//     the sun's energy, so the fill does most of the lifting.
//
//  4. ENVIRONMENT. A PMREM'd copy of the sky (see skyEnv.ts).
//     Gives every PBR surface a plausible reflection and a soft
//     directional ambient the hemisphere light cannot: the car's
//     clearcoat has something to mirror, the wheels get a hot
//     spot where the sun actually is.
//
//  Then everything sits in warm haze. Fog near/far ride
//  CONFIG.drawDistanceM, so lowering the draw distance pulls the
//  haze in with it and the world never hard-clips at the far
//  plane - it dissolves before it gets there.
// ============================================================

const SHADOW_MAP = 2048
const SHADOW_RADIUS = 92 //     metres, half-width of the ortho box
const SUN_DISTANCE = 260 //     how far up the sun ray the light sits
const TEXEL = (SHADOW_RADIUS * 2) / SHADOW_MAP

/** Warm haze. Sits between the sky's warm horizon and its violet anti-sun band. */
const FOG_COLOR = '#CDA184'
/** Near is held out enough that haze never washes the road you are looking at, but
 *  pulled in from 0.24 to 0.19 (~228 m) for D-FOG: at 0.24 the warm haze barely built
 *  across the 300-900 m foothill band, so plane 2 stayed crisp and the distant mountains
 *  had no atmosphere to dissolve INTO. Far still runs PAST the draw distance so the
 *  silhouettes survive as the third depth plane. */
const FOG_NEAR = CONFIG.drawDistanceM * 0.19
const FOG_FAR = CONFIG.drawDistanceM * 1.25

// Per-frame scratch. Nothing in useFrame allocates.
const _pos = new THREE.Vector3()

export function Lighting() {
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const targetRef = useRef<THREE.Object3D>(null)
  const shadowTypeFixed = useRef(false)

  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  // The sun, and the light-space basis three's shadow camera will build from it.
  // Object3D.lookAt makes z = normalize(eye - target) = sunDir, x = up X z, y = z X x.
  // Snapping along THOSE axes is what actually kills the shimmer.
  const { sun, axisX, axisY } = useMemo(() => {
    const s = getSunDirection()
    const x = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), s).normalize()
    const y = new THREE.Vector3().crossVectors(s, x).normalize()
    return { sun: s, axisX: x, axisY: y }
  }, [])

  useEffect(() => {
    const env = buildSkyEnvironment(gl)
    scene.environment = env.texture
    // Low. The environment's job is reflections and a little shape in the
    // shadows, not lighting the scene - that is the sun's job. Turn this up
    // and the whole valley goes flat and milky.
    scene.environmentIntensity = 0.34
    return () => {
      scene.environment = null
      env.dispose()
    }
  }, [gl, scene])

  useEffect(() => {
    const light = lightRef.current
    const target = targetRef.current
    if (!light || !target) return
    light.target = target
    light.shadow.camera.updateProjectionMatrix()
    light.shadow.radius = 3
  }, [])

  useFrame(() => {
    const light = lightRef.current
    const target = targetRef.current
    if (!light || !target) return

    // three deprecated PCFSoftShadowMap - r3f's default whenever `shadows` is on -
    // and silently downgrades it, warning once. Ask for what we actually get.
    //
    // This cannot live in an effect: React runs child effects BEFORE parent ones,
    // so Canvas re-applies PCFSoftShadowMap after Lighting has mounted. The first
    // useFrame tick is the earliest point that survives, and it still lands before
    // a single shadow shader has compiled.
    if (!shadowTypeFixed.current) {
      shadowTypeFixed.current = true
      gl.shadowMap.type = THREE.PCFShadowMap
      gl.shadowMap.needsUpdate = true
    }

    // Snap the frustum centre to whole shadow texels in light space.
    const car = telemetry.carPosition
    const dx = axisX.dot(car)
    const dy = axisY.dot(car)
    _pos
      .copy(car)
      .addScaledVector(axisX, Math.round(dx / TEXEL) * TEXEL - dx)
      .addScaledVector(axisY, Math.round(dy / TEXEL) * TEXEL - dy)

    target.position.copy(_pos)
    target.updateMatrixWorld()
    light.position.copy(_pos).addScaledVector(sun, SUN_DISTANCE)
  })

  return (
    <>
      <directionalLight
        ref={lightRef}
        color={SUN_COLOR}
        intensity={6.6}
        position={[sun.x * SUN_DISTANCE, sun.y * SUN_DISTANCE, sun.z * SUN_DISTANCE]}
        castShadow
        shadow-mapSize-width={SHADOW_MAP}
        shadow-mapSize-height={SHADOW_MAP}
        shadow-camera-left={-SHADOW_RADIUS}
        shadow-camera-right={SHADOW_RADIUS}
        shadow-camera-top={SHADOW_RADIUS}
        shadow-camera-bottom={-SHADOW_RADIUS}
        shadow-camera-near={20}
        shadow-camera-far={SUN_DISTANCE + SHADOW_RADIUS * 2}
        shadow-bias={-0.0002}
        shadow-normalBias={0.35}
      />
      <object3D ref={targetRef} />

      {/* cool sky over warm dust: the whole reason a shadow here reads blue-ish
          and a lit face reads gold */}
      <hemisphereLight args={['#7B90C4', '#C9A268', 0.55]} />

      <SunFlare />

      <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />
      <color attach="background" args={[FOG_COLOR]} />
    </>
  )
}
