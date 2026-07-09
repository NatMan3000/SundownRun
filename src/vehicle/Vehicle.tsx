// The car. Composes: physics body + collider, the raycast-suspension hook
// (which also owns input, telemetry, gearbox and lap timing), and the visual
// body. Nothing in this file knows how the car handles - that lives in
// useVehiclePhysics.ts and tuning.ts.

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'

import { getSpawn } from '../core/terrain'
import { CarBody } from './CarBody'
import type { CarBodyHandle } from './carVisual'
import { TempGround } from './TempGround'
import { CHASSIS } from './tuning'
import { useVehiclePhysics } from './useVehiclePhysics'

/**
 * TEMP - the world now mounts a real terrain heightfield (world/Colliders.tsx),
 * so this is OFF. Flip it back on only to debug the vehicle without a world.
 * See TempGround.tsx; delete both once the world colliders are settled.
 */
const TEMP_GROUND = false

export function Vehicle() {
  const spawn = useMemo(() => getSpawn(), [])
  const bodyRef = useRef<RapierRigidBody>(null)
  const visualRef = useRef<THREE.Group>(null)
  const carRef = useRef<CarBodyHandle>(null)

  useVehiclePhysics({ bodyRef, visualRef, carRef })

  return (
    <>
      {TEMP_GROUND && <TempGround />}

      <RigidBody
        ref={bodyRef}
        type="dynamic"
        colliders={false}
        canSleep={false}
        ccd
        linearDamping={0}
        angularDamping={CHASSIS.angularDamping}
        position={[spawn.position.x, spawn.position.y, spawn.position.z]}
        rotation={[0, spawn.rotationY, 0]}
      >
        {/* density 0: the body's mass properties are set explicitly in the physics
            hook, so the centre of mass sits where we want it and not where a
            uniform box says it should. */}
        <CuboidCollider
          args={[CHASSIS.halfExtents.x, CHASSIS.halfExtents.y, CHASSIS.halfExtents.z]}
          position={[0, CHASSIS.offsetY, 0]}
          density={0}
          friction={0.35}
          restitution={0.08}
        />

        {/* This group is parented straight to the RigidBody's object3D, so its
            world matrix carries rapier's INTERPOLATED pose - which is what the
            camera and fx read, never the raw 60Hz staircase. */}
        <group ref={visualRef}>
          <CarBody ref={carRef} />
        </group>
      </RigidBody>
    </>
  )
}
