// ============================================================
//  GHOST CAR - the replay of your best lap, made of light
// ------------------------------------------------------------
//  A translucent, softly glowing double of the car that drove
//  the current best lap. It has NO physics body and NO collider:
//  it is a single object3D whose pose is read straight off the
//  stored trace (vehicle/ghost.ts), time-synced to the player's
//  live lap clock. When the player crosses the start line the
//  ghost sets off from the same spot; interpolation between the
//  recorded samples (60Hz - see ghost.ts REC_HZ) keeps it gliding.
//
//  It reuses the EXACT car geometry (getBody / WHEEL_GEOM from
//  CarBody) so the ghost is unmistakably "the same car" - just
//  rendered as a warm spectral shell instead of painted metal.
//  One shared translucent material, no per-frame allocation.
//
//  Visible only while a lap is being timed AND a trace exists.
//  No best lap yet -> no ghost. Restart / reset -> the lap clock
//  disarms and the ghost vanishes with it, reappearing at the
//  line on the next flying lap. A new best mid-session replaces
//  the trace (and its car body) on the spot, via store.ghostVersion.
// ============================================================

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

import { CONFIG } from '../core/config'
import { useGameStore } from '../core/store'
import { getBody, WHEEL_GEOM } from './CarBody'
import type { BodyGeometry } from './CarBody'
import { getGhostTrace, ghostState, loadGhost } from './ghost'
import type { GhostTrace } from './ghost'
import { lapState } from './lapTracker'
import { WHEEL } from './tuning'

// Wheel rest positions, chassis-local. Same formula as carVisual.wheel() - the
// ghost's wheels sit at full ride height (it has no live suspension to travel).
const REST_WHEEL_Y = WHEEL.anchorY - WHEEL.restLength + 0.1
const GHOST_WHEELS: readonly [number, number, number][] = [
  [WHEEL.halfTrack, REST_WHEEL_Y, WHEEL.halfBase], //   FL
  [-WHEEL.halfTrack, REST_WHEEL_Y, WHEEL.halfBase], //  FR
  [WHEEL.halfTrack, REST_WHEEL_Y, -WHEEL.halfBase], //  RL
  [-WHEEL.halfTrack, REST_WHEEL_Y, -WHEEL.halfBase], // RR
]

// ---------- module temps: never allocated per frame ----------
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()

/**
 * Interpolated pose at `tSec` seconds into the trace. Linear on position, slerp
 * on rotation. Past the end it holds the final sample (the ghost has finished).
 */
function sampleTrace(trace: GhostTrace, tSec: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion): void {
  const maxI = trace.count - 1
  const f = tSec * trace.hz
  let i = Math.floor(f)
  if (i < 0) i = 0
  if (i >= maxI) {
    const p = maxI * 3
    const q = maxI * 4
    outPos.set(trace.pos[p], trace.pos[p + 1], trace.pos[p + 2])
    outQuat.set(trace.quat[q], trace.quat[q + 1], trace.quat[q + 2], trace.quat[q + 3])
    return
  }
  const a = f - i
  const p0 = i * 3
  const p1 = p0 + 3
  outPos.set(
    trace.pos[p0] + (trace.pos[p1] - trace.pos[p0]) * a,
    trace.pos[p0 + 1] + (trace.pos[p1 + 1] - trace.pos[p0 + 1]) * a,
    trace.pos[p0 + 2] + (trace.pos[p1 + 2] - trace.pos[p0 + 2]) * a
  )
  const q0 = i * 4
  const q1 = q0 + 4
  _qa.set(trace.quat[q0], trace.quat[q0 + 1], trace.quat[q0 + 2], trace.quat[q0 + 3])
  _qb.set(trace.quat[q1], trace.quat[q1 + 1], trace.quat[q1 + 2], trace.quat[q1 + 3])
  outQuat.slerpQuaternions(_qa, _qb, a)
}

export function GhostCar() {
  const groupRef = useRef<THREE.Group>(null)
  const lastColor = useRef('')

  // Reactive rebuild signal: bumped when a new best trace is committed (and once
  // more below, right after a stored trace is restored at boot).
  const ghostVersion = useGameStore((s) => s.ghostVersion)

  // Restore last session's best-lap ghost once, then force one reactive pass so
  // the geometry memo below picks the restored body up.
  useEffect(() => {
    if (loadGhost()) useGameStore.getState().bumpGhost()
  }, [])

  // The ghost wears the body it was RECORDED with, reusing CarBody's cached
  // geometry. Rebuilds only when the trace changes - never per frame.
  // Depends on ghostVersion, not the module-level trace: the version bump is the
  // signal that the trace (and possibly its body) changed.
  const geom = useMemo<BodyGeometry | null>(() => {
    const trace = getGhostTrace()
    return trace ? getBody(trace.body) : null
  }, [ghostVersion])

  // One shared spectral material. Colour / opacity are pushed from CONFIG every
  // frame so a kid editing ghostColor / ghostOpacity sees it live, same as the
  // real car's paint. depthWrite off so the translucent shell never punches a
  // hole in what is behind it.
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: CONFIG.ghostColor,
      emissive: CONFIG.ghostColor,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: CONFIG.ghostOpacity,
      depthWrite: false,
      roughness: 0.4,
      metalness: 0,
    })
    return m
  }, [])

  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const group = groupRef.current
    if (!group) return

    const trace = getGhostTrace()
    // Hidden unless the feature is on, a trace exists, and a lap is being timed.
    if (!CONFIG.ghost || !trace || !lapState.armed) {
      if (group.visible) group.visible = false
      ghostState.playing = false
      return
    }

    const tSec = lapState.lapElapsedMs / 1000
    const durSec = (trace.count - 1) / trace.hz
    // The player is now slower than the ghost's whole lap - the ghost already
    // crossed the line, so take it off screen rather than park it awkwardly.
    if (tSec > durSec + 0.15) {
      if (group.visible) group.visible = false
      ghostState.playing = false
      return
    }

    sampleTrace(trace, tSec, _pos, _quat)
    group.position.copy(_pos)
    group.quaternion.copy(_quat)
    group.visible = true

    // Live colour / opacity from CONFIG (kid door), plus a gentle shimmer so it
    // reads as a spirit rather than a flat decal. String-parse the colour only
    // when it actually changed - no allocation on the steady-state path.
    if (CONFIG.ghostColor !== lastColor.current) {
      material.color.set(CONFIG.ghostColor)
      material.emissive.set(CONFIG.ghostColor)
      lastColor.current = CONFIG.ghostColor
    }
    material.opacity = CONFIG.ghostOpacity
    material.emissiveIntensity = 0.5 + 0.12 * Math.sin(state.clock.elapsedTime * 3.0)

    ghostState.playing = true
    ghostState.position.copy(_pos)
  })

  return (
    <group ref={groupRef} visible={false}>
      {geom && (
        <>
          {/* Reuse the recorded body's cached shell, glowing instead of painted. */}
          <mesh geometry={geom.paint} material={material} renderOrder={10} />
          <mesh geometry={geom.cabin} material={material} renderOrder={10} />
          <mesh geometry={geom.glass} material={material} renderOrder={10} />

          {/* Static wheels at rest height - a ghost has no suspension to work. */}
          {GHOST_WHEELS.map((p, i) => (
            <group key={i} position={p} scale={[i % 2 === 0 ? 1 : -1, 1, 1]}>
              <mesh geometry={WHEEL_GEOM.tyre} material={material} renderOrder={10} />
              <mesh geometry={WHEEL_GEOM.rim} material={material} renderOrder={10} />
            </group>
          ))}
        </>
      )}
    </group>
  )
}
