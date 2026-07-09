---
type: auto
session_id: e7c95ed0-1878-4920-9115-5778087be3af
project: CarDriveGame3d
date: 2026-07-09
topic: World worker - terrain, boundary, tree-smash, physics probing
duration: 5.6 hours
events: 459
---

# World Worker: Terrain, Boundary, Tree-Smash, Physics Probing

**Duration:** 5.6 hours
**Participants:** Nathan, Kai
**Session Restart ID:** `claude -r e7c95ed0-1878-4920-9115-5778087be3af`

Fully autonomous "world worker" teammate session in the Sundown Run multi-agent build - owned `src/world/**` and `src/core/terrain.ts`. Built the terrain/road/sky/vegetation world from scratch, then worked through four rounds of player-reported defects and art-direction rulings: a sealed world boundary, tree-smash collision, a start line, off-track playground jumps, and two rewrites of the mountain skyline (a "custard wall" rejection, then the D-FOG atmospheric-bridge fix). Did extensive empirical physics probing along the way, catching a rapier heightfield tunnelling bug its own harness initially misdiagnosed as something else.

## What We Did

1. Built the world from the constitution: a 3865m closed circuit (two crest jumps, a 30m hairpin), fbm terrain welded to the road within 2mm, a procedural golden-hour sky dome, three instanced tree species + rocks + wind-swayed grass, and static rapier colliders (heightfield + near-road obstacles) - all within the 300-draw-call / 1.5M-triangle budget.
2. Empirically determined rapier's heightfield index ordering (`iz + ix*(N+1)`, not the naive layout) via a raycast probe before writing the frozen terrain API, avoiding a silent 90-degree collision-vs-visual mismatch.
3. Fixed a self-caught catastrophic-failure screenshot check: grass rendering as 1.8m pale spikes, an oversized dusty road shoulder, and a texture that was quietly draining 25% of the ground's gold tint via multiply blending.
4. Sealed the world boundary (W1) - a physically-contained bowl (steep unclimbable rim + a failsafe collider ring), verified via a from-scratch headless rapier harness rather than eyeballing.
5. Built tree-smash (W2) - all 1342 trees carry a trunk collider; a `useBeforePhysicsStep` hook disarms the collider before contact resolves once impact speed clears the smash threshold, so fast hits fling the tree without bricking the car while slow hits stay solid.
6. Diagnosed a real rapier engine limitation while chasing what first looked like a harness bug: heightfield colliders are infinitely thin, so a chassis descending past ~28 m/s in one 60Hz step can tunnel straight through regardless of CCD settings - added a catch-floor slab + below-terrain auto-reset as the backstop (documented in project CLAUDE.md gotchas).
7. Built and iterated the checkered start line (W3), fixing a back-face-culling bug (wrong triangle winding put the paint's normal facing down, making it invisible) discovered only via screenshot, not code review.
8. Added four off-track playground jump landforms as terrain-shaped Easter eggs, then reworked the boundary/mountain skyline twice against art-direction feedback: first from a "featureless golden custard wall" to natural slope-broken terrain with a receding violet mountain ring, then a second pass to push the rock face down so sky dominates the view above the ridge.
9. Fixed the "D-FOG" defect flagged by checker-2: the camera-locked, `fog:false` mountain ring shared no atmosphere with the fogged foothills and read as a flat cutout band - fixed by baking a warm-haze vertex-colour bridge toward the fog colour and pulling in `FOG_NEAR` (one-line grant into `fx/Lighting.tsx`).
10. Verified every change with a from-scratch headless physics harness (grew to 19/19 checks) plus `?demo=1` browser perf runs, never trusting the harness's first result without cross-checking - twice caught its own probe bugs (a massless test body, a stale terrain-height comparison) before accepting a finding as real.

## Key Decisions

| Decision | Rationale |
|---|---|
| Determine rapier heightfield row/column order empirically (raycast probe) before writing the frozen terrain API | A wrong guess would have rotated the collision world 90 degrees under the wheels while looking perfect in the mesh |
| Catch-floor slab + below-terrain auto-reset for heightfield tunnelling | Rapier heightfield colliders are infinitely thin and CCD does not arm on them; verified across `maxCcdSubsteps` 1/4/8 and both mass-setting paths - this is an engine constraint, not tunable away |
| `useBeforePhysicsStep` to disarm a doomed tree's collider before `world.step()` | Lets a fast hit fling the tree instance without the contact solver ever bricking the car on a single-step static-body impact |
| Mountains dissolve via per-vertex alpha-to-zero at the summit (`fog:false`, unlit) instead of fogging to a solid colour | A fogged-to-colour silhouette can never match a gradient sky and reads as a hard-edged slab; alpha dissolve is colour-independent by construction |
| Warm-haze bridge baked into mountain vertex colours, keyed to the same alpha-depth that drives the dissolve | The alpha-to-sky top edge alone left the mid-distance mountain base disconnected in tone from the fogged foothills (cool violet vs warm `#CDA184`) - needed a shared-atmosphere colour ramp, not just transparency |
| Verify every claim against a from-scratch headless rapier harness building the same colliders as the game, never against self-reported traces | The harness itself produced two false findings (a massless test body, a stale terrain-height baseline) that would have been filed as game bugs without re-derivation |

## Files Created

| File | Description |
|---|---|
| `src/world/World.tsx` | Composes all world sub-components |
| `src/world/sun.ts` | `getSunDirection()` contract shared with the lighting rig |
| `src/world/textures.ts` | Procedural asphalt/ground/cloud textures (≤1024px) |
| `src/world/heightfield.ts` | Shared height lattice feeding both the visual mesh and the rapier collider |
| `src/world/scatter.ts` | Deterministic seeded placement for trees, rocks, grass, scree |
| `src/world/geometry.ts` | Procedural geometry - tree canopies, rocks, mountain rings |
| `src/world/wind.ts` | Shared wind/gust uniform driving grass and canopy sway |
| `src/world/SkyDome.tsx`, `Terrain.tsx`, `Road.tsx`, `Trees.tsx`, `Grass.tsx`, `Rocks.tsx`, `Mountains.tsx`, `Colliders.tsx` | World render components |
| `src/world/boundary.ts` | Failsafe collider ring + catch-floor slab, sized by an energy-budget argument |
| `src/world/treeSmash.ts` | Per-instance trunk collider disarm + fling/topple animation |
| `src/world/StartLine.tsx` | Checkered start/finish band + gantry, placed exactly at spline t=0 |
| `scratchpad/checks/physics-harness.ts` | Grew to 19/19 headless rapier checks covering W1 containment, W2 smash, and tunnelling |
| `scratchpad/checks/world-worker-fixes.md` | Working report of every round's fixes and verification numbers |

## Files Modified

| File | Description |
|---|---|
| `src/core/terrain.ts` | Rewrote implementation behind the frozen API; later added a bearing-varying rim table, gullies, and playground landforms |
| `src/fx/Lighting.tsx` | One-line `FOG_NEAR` pull-in (explicit ownership grant from the lead) for the D-FOG fix |

## Next Steps

- [ ] A tunnelled car currently strands under the map until manual reset (R) - an auto-reset belongs in vehicle code, not world's
- [ ] `TEMP_GROUND`/legacy stub cleanup in `src/vehicle/TempGround.tsx` is dead code left for the drive worker to remove

## Related Sessions

- This session ran concurrently (2026-07-09) with two sibling worker sessions in this same project:
  - sessions/2026-07-09-vehicle-worker-physics-tuning.md (drive worker - vehicle physics/tuning)
  - sessions/2026-07-09-fx-postprocessing-worker.md (FX/post-processing worker - lighting/materials/particles)
