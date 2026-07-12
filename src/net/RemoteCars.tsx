// ============================================================
//  REMOTE CARS - the other players, made of matter
// ------------------------------------------------------------
//  One kinematic rapier body per connected peer, driven by the
//  interpolated pose stream (net.ts). This is GhostCar's replay
//  trick with the physics turned on:
//
//  * kinematicPosition + setNextKinematicTranslation/Rotation means
//    rapier derives real contact velocities from the streamed motion,
//    so the LOCAL dynamic car gets genuinely shoved when they collide.
//    The mirror image happens on the other machine - each player's car
//    is only ever pushed by physics on their own screen, and the
//    result flows back through their own pose stream. Both screens
//    converge on "we crashed".
//  * A kinematic body is immovable in the local sim (infinite mass) -
//    ramming a parked opponent feels like hitting a wall. That is the
//    honest cost of never needing to reconcile two physics worlds.
//  * CONFIG.multiplayerRam=false skips the collider entirely and the
//    opponent becomes a pass-through ghost with paint.
//
//  The body is created IMPERATIVELY (world.createRigidBody), not via
//  the <RigidBody> component: the declarative wrapper also feeds a
//  kinematic body's target from its own scene-graph transform every
//  frame, which fights setNextKinematicTranslation and leaves the
//  body trailing seconds behind the stream (found the hard way in the
//  first cut of this file). One writer, no fight. The VISUAL group is
//  plain three.js, posed directly from the same interpolated sample
//  at render rate - smoother than any physics-step sync could be.
//
//  Until a peer's first packet lands (and whenever its stream goes
//  stale - hidden tab, dropped wifi) the body parks far below the
//  world and the visual hides, so nobody hits an invisible wall.
// ============================================================

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'

import { CONFIG } from '../core/config'
import { getBody, WHEEL_GEOM } from '../vehicle/CarBody'
import { CHASSIS, WHEEL } from '../vehicle/tuning'
import { INTERP_MS, STALE_MS, peerPoses } from './net'
import { useNetStore } from './netStore'
import type { PeerInfo } from './netStore'

// Same rest-height wheel formula as the ghost - no live suspension to travel.
const REST_WHEEL_Y = WHEEL.anchorY - WHEEL.restLength + 0.1
const WHEEL_POSITIONS: readonly [number, number, number][] = [
  [WHEEL.halfTrack, REST_WHEEL_Y, WHEEL.halfBase],
  [-WHEEL.halfTrack, REST_WHEEL_Y, WHEEL.halfBase],
  [WHEEL.halfTrack, REST_WHEEL_Y, -WHEEL.halfBase],
  [-WHEEL.halfTrack, REST_WHEEL_Y, -WHEEL.halfBase],
]

/** Off-world parking spot while a peer has no live stream. */
const PARK_Y = -500

// ---------- module temps: never allocated per frame ----------
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _park = { x: 0, y: PARK_Y, z: 0 }

// ---------- name tag ----------

function buildNameTexture(name: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(26, 20, 16, 0.55)'
  ctx.beginPath()
  ctx.roundRect(2, 6, 252, 52, 16)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.font = '700 30px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#F2E8D5'
  ctx.fillText(name, 128, 34)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ============================================================

function RemoteCar({ peer }: { peer: PeerInfo }) {
  const { world, rapier } = useRapier()
  const groupRef = useRef<THREE.Group>(null)
  const spinRefs = useRef<(THREE.Group | null)[]>([null, null, null, null])
  const live = useRef(false)
  const wheelSpin = useRef(0)

  const geom = useMemo(() => getBody(peer.body), [peer.body])

  // The solid half: an imperative kinematic body + chassis-sized cuboid.
  // Held in a ref so the physics-step callback below reads the live handle.
  const bodyRef = useRef<RapierRigidBody | null>(null)
  useEffect(() => {
    if (!CONFIG.multiplayerRam) return
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PARK_Y, 0).setCanSleep(false)
    )
    world.createCollider(
      rapier.ColliderDesc.cuboid(CHASSIS.halfExtents.x, CHASSIS.halfExtents.y, CHASSIS.halfExtents.z)
        .setTranslation(0, CHASSIS.offsetY, 0)
        .setFriction(0.35)
        .setRestitution(0.08),
      body
    )
    bodyRef.current = body
    return () => {
      bodyRef.current = null
      world.removeRigidBody(body) // takes its collider with it
    }
  }, [world, rapier])

  // Their paint, the local car's finish. Cabin shares the shell material like
  // the real car; glass and trim are close matches to CarBody's constants.
  const paintMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: peer.color,
        roughness: 0.24,
        metalness: 0.42,
        clearcoat: 0.6,
        clearcoatRoughness: 0.22,
      }),
    [peer.color]
  )
  const glassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#1A2129', roughness: 0.12, metalness: 0.9 }),
    []
  )
  const darkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#20242A', roughness: 0.66, metalness: 0.15 }),
    []
  )
  const nameTex = useMemo(() => buildNameTexture(peer.name, peer.color), [peer.name, peer.color])
  const nameMat = useMemo(
    () => new THREE.SpriteMaterial({ map: nameTex, depthWrite: false, transparent: true }),
    [nameTex]
  )

  useEffect(
    () => () => {
      paintMat.dispose()
      glassMat.dispose()
      darkMat.dispose()
      nameMat.dispose()
      nameTex.dispose()
    },
    [paintMat, glassMat, darkMat, nameMat, nameTex]
  )

  // ----- physics step: hand the collider its next pose -----
  useBeforePhysicsStep(() => {
    const body = bodyRef.current
    if (!body) return
    const buf = peerPoses.get(peer.id)
    const now = performance.now()
    const fresh = buf !== undefined && now - buf.lastRecv < STALE_MS

    if (!fresh || !buf.sample(now - INTERP_MS, _pos, _quat)) {
      if (live.current) {
        live.current = false
        body.setNextKinematicTranslation(_park)
      }
      return
    }
    live.current = true
    body.setNextKinematicTranslation(_pos)
    body.setNextKinematicRotation(_quat)
  })

  // ----- render frame: pose the visual from the same stream, spin the wheels -----
  useFrame((_, dt) => {
    const group = groupRef.current
    if (!group) return

    const buf = peerPoses.get(peer.id)
    const now = performance.now()
    const fresh = buf !== undefined && now - buf.lastRecv < STALE_MS
    // Collision needs the physics world (live ref above); the VISUAL only needs
    // the stream, so it works with multiplayerRam off too.
    const show = fresh && !!buf && buf.sample(now - INTERP_MS, _pos, _quat)
    if (group.visible !== show) group.visible = show
    if (!show) return

    group.position.copy(_pos)
    group.quaternion.copy(_quat)

    wheelSpin.current += (buf.speedKmh / 3.6 / WHEEL.radius) * dt
    for (let i = 0; i < 4; i++) {
      const g = spinRefs.current[i]
      if (g) g.rotation.x = wheelSpin.current
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh geometry={geom.paint} material={paintMat} castShadow />
      <mesh geometry={geom.cabin} material={paintMat} castShadow />
      <mesh geometry={geom.glass} material={glassMat} />
      <mesh geometry={geom.trim} material={darkMat} />

      {WHEEL_POSITIONS.map((p, i) => (
        <group key={i} position={p} scale={[i % 2 === 0 ? 1 : -1, 1, 1]}>
          <group
            ref={(g) => {
              spinRefs.current[i] = g
            }}
          >
            <mesh geometry={WHEEL_GEOM.tyre} material={darkMat} />
            <mesh geometry={WHEEL_GEOM.rim} material={glassMat} />
          </group>
        </group>
      ))}

      {/* floating name tag */}
      <sprite material={nameMat} position={[0, 1.7, 0]} scale={[1.9, 0.48, 1]} />
    </group>
  )
}

/** Mounted inside <Physics>. Renders one car per peer that has said hello. */
export function RemoteCars() {
  const peers = useNetStore((s) => s.peers)
  return (
    <>
      {Object.values(peers).map((p) => (
        <RemoteCar key={p.id} peer={p} />
      ))}
    </>
  )
}
