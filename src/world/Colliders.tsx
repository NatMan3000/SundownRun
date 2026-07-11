import { useEffect, useMemo } from 'react'
import {
  CuboidCollider,
  HeightfieldCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type HeightfieldArgs,
} from '@react-three/rapier'
import { WORLD_SIZE } from '../core/terrain'
import { CONFIG } from '../core/config'
import { BOUNDARY, CATCH_FLOOR, boundarySegments } from './boundary'
import { TERRAIN_RES, getRapierHeights } from './heightfield'
import { getScatter } from './scatter'
import { START_LINE_POSTS } from './StartLine'
import { RIM_RUN_GATE_POSTS } from './RimRuns'
import { resetRimRunGates, stepRimRunGates } from './rimRunGates'
import { getTreeBodies, resetTreeSmash, stepTreeSmash } from './treeSmash'

// ============================================================
// Static colliders only (constitution, section 2):
//
//   - one heightfield sampled from the SAME lattice as the terrain mesh, so
//     nothing the car hits is invisible;
//   - the failsafe boundary ring (see boundary.ts);
//   - a trunk for EVERY reachable tree and a ball for every rock big enough to
//     look solid (constitution, section 5 - no ghosts);
//   - the start-line posts.
//
// The trees and rocks are built imperatively rather than as ~2000 React elements:
// one wasm call each instead of a fibre, a ref and a reconciliation pass. It also
// hands treeSmash.ts the Collider handles it needs to disarm a trunk mid-flight.
// ============================================================

function ObstacleColliders() {
  const { world, rapier } = useRapier()
  const { rockColliders } = getScatter()
  const bouncyRocks = CONFIG.bouncyRocks

  useEffect(() => {
    const trees = getTreeBodies()
    resetTreeSmash()
    resetRimRunGates()

    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed())

    for (const t of trees) {
      const desc = rapier.ColliderDesc.cylinder(t.trunkH / 2, t.trunkR)
        .setTranslation(t.x, t.y + t.trunkH / 2, t.z)
        .setFriction(0.55)
        .setRestitution(0.25)
      t.collider = world.createCollider(desc, body)
    }

    // CONFIG.bouncyRocks reshapes the rock collision instead of adding an impulse hack.
    // Bouncy: a proud, girth-wide dome (upper-hemisphere contact -> up-tilted normals) with
    // low friction so the car rides up and high restitution so it launches - and both are
    // forced to WIN the material combine, so the bounce belongs to the rock regardless of
    // the car's own friction/restitution. Off: today's grippy sunk ball.
    const bouncy = bouncyRocks
    for (const r of rockColliders) {
      const desc = bouncy
        ? rapier.ColliderDesc.ball(r.bounceR)
            .setTranslation(r.x, r.bounceY, r.z)
            .setFriction(0.12)
            .setFrictionCombineRule(rapier.CoefficientCombineRule.Min)
            .setRestitution(0.75)
            .setRestitutionCombineRule(rapier.CoefficientCombineRule.Max)
        : rapier.ColliderDesc.ball(r.r)
            .setTranslation(r.x, r.y, r.z)
            .setFriction(0.9)
            .setRestitution(0.15)
      world.createCollider(desc, body)
    }

    return () => {
      // removeRigidBody takes its colliders with it; drop the stale handles first so a
      // smash sweep mid-teardown can never poke a freed pointer.
      for (const t of trees) t.collider = null
      world.removeRigidBody(body)
    }
    // CONFIG.bouncyRocks is in the deps so a kid toggling it in config.ts rebuilds the
    // rock colliders on the spot.
  }, [world, rapier, rockColliders, bouncyRocks])

  // Runs immediately before every world.step(), which is the whole trick: a trunk the
  // car is about to reach at speed is disabled BEFORE any contact is solved.
  useBeforePhysicsStep((w) => {
    stepTreeSmash(w)
    stepRimRunGates(w)
  })

  return null
}

export function Colliders() {
  // args must be a stable reference: AnyCollider rebuilds the collider when it changes,
  // and rebuilding a 103k-sample heightfield per render would be a disaster.
  const heightfieldArgs = useMemo<HeightfieldArgs>(
    () => [TERRAIN_RES, TERRAIN_RES, getRapierHeights(), { x: WORLD_SIZE, y: 1, z: WORLD_SIZE }],
    []
  )
  const wall = useMemo(() => boundarySegments(), [])

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <HeightfieldCollider args={heightfieldArgs} friction={1.15} restitution={0.02} />

        {/* The failsafe rim. Invisible, buried, and 144 m of rock up a 71-degree face. */}
        {wall.map((s, i) => (
          <CuboidCollider
            key={`w${i}`}
            args={[s.halfLength, BOUNDARY.halfHeight, BOUNDARY.halfThickness]}
            position={[s.x, s.y, s.z]}
            rotation={[0, s.rotY, 0]}
            friction={0.4}
            restitution={0.1}
          />
        ))}

        {/* A heightfield is a surface, not a solid. This is what "cannot fall off" means
            when someone triples the top speed. See boundary.ts. */}
        <CuboidCollider
          args={[CATCH_FLOOR.halfXZ, CATCH_FLOOR.halfY, CATCH_FLOOR.halfXZ]}
          position={[0, CATCH_FLOOR.y, 0]}
          friction={1.4}
          restitution={0}
        />

        {START_LINE_POSTS.map((p, i) => (
          <CuboidCollider
            key={`p${i}`}
            args={[p.halfX, p.halfY, p.halfZ]}
            position={[p.x, p.y, p.z]}
            rotation={[0, p.rotY, 0]}
            friction={0.6}
            restitution={0.2}
          />
        ))}

        {/* Big-air run entrance-gate posts. Gap is the drivable line down the chute. */}
        {RIM_RUN_GATE_POSTS.map((p, i) => (
          <CuboidCollider
            key={`rr${i}`}
            args={[p.halfX, p.halfY, p.halfZ]}
            position={[p.x, p.y, p.z]}
            rotation={[0, p.rotY, 0]}
            friction={0.6}
            restitution={0.2}
          />
        ))}
      </RigidBody>

      <ObstacleColliders />
    </>
  )
}
