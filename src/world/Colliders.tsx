import { useMemo } from 'react'
import {
  BallCollider,
  CuboidCollider,
  HeightfieldCollider,
  RigidBody,
  type HeightfieldArgs,
} from '@react-three/rapier'
import { WORLD_SIZE } from '../core/terrain'
import { TERRAIN_RES, getRapierHeights } from './heightfield'
import { getScatter } from './scatter'

// ============================================================
// Static colliders only (constitution, section 2):
//   - one heightfield sampled from the SAME lattice as the terrain
//     mesh, so nothing the car hits is invisible;
//   - simple shapes for the large obstacles within 25 m of the road.
// Distant decoration gets nothing.
//
// All of it hangs off one fixed rigid body rather than one body per
// collider.
// ============================================================

export function Colliders() {
  const { obstacles } = getScatter()

  // args must be a stable reference: AnyCollider rebuilds the collider when it changes,
  // and rebuilding a 148k-sample heightfield per render would be a disaster.
  const heightfieldArgs = useMemo<HeightfieldArgs>(
    () => [
      TERRAIN_RES,
      TERRAIN_RES,
      getRapierHeights(),
      { x: WORLD_SIZE, y: 1, z: WORLD_SIZE },
    ],
    []
  )

  return (
    <RigidBody type="fixed" colliders={false}>
      <HeightfieldCollider args={heightfieldArgs} friction={1.15} restitution={0.02} />
      {obstacles.map((o, i) =>
        o.kind === 'tree' ? (
          <CuboidCollider
            key={`t${i}`}
            args={[o.r, o.h / 2, o.r]}
            position={[o.x, o.y + o.h / 2, o.z]}
            friction={0.6}
            restitution={0.2}
          />
        ) : (
          <BallCollider
            key={`r${i}`}
            args={[o.r]}
            position={[o.x, o.y + o.r * 0.45, o.z]}
            friction={0.9}
            restitution={0.15}
          />
        )
      )}
    </RigidBody>
  )
}
