---
type: auto
session_id: 801b5b0d-68c0-47b1-8d2f-7aba21529c50
project: CarDriveGame3d
date: 2026-07-09
topic: Look worker - lighting, post-fx, car body, particles
duration: 4.7 hours
events: 465
---

# Look Worker: Lighting, Post-Processing, Car Body Rebuild, Driving FX

**Duration:** 4.7 hours
**Participants:** Nathan, Kai
**Session Restart ID:** `claude -r 801b5b0d-68c0-47b1-8d2f-7aba21529c50`

Autonomous "look worker" run (0 direct user prompts - all direction came from the team-lead orchestrator) owning `src/fx/**` and `src/vehicle/CarBody.tsx`. Built the golden-hour lighting rig, the `@react-three/postprocessing` grade stack, a from-scratch procedural car body (rebuilt several times against lead feedback), and allocation-free drift-smoke/skidmark FX - then chased down a `mergeGeometries` black-canvas blocker and a whole-face roof z-fight before shutting down clean on the checker-2 DONE ruling.

## What We Did

1. Built `Lighting.tsx` - warm directional sun locked to `getSunDirection()`, 2048 shadow map with a tight car-following orthographic frustum, hemisphere fill, palette-matched fog, plus `skyEnv.ts` for a procedural PMREM environment map so PBR materials get plausible reflections.
2. Built `Effects.tsx` - `@react-three/postprocessing` `EffectComposer` with SMAA, ACES tonemapping, subtle Bloom/Vignette, and a custom `grade.ts` colour-grade effect (warm highlights, lifted teal shadows, later an olive push for front-lit greens); added `SunFlare.tsx` for the sun disc.
3. Rebuilt `CarBody.tsx` from a placeholder box into a procedural coupe (`THREE.Shape` + `ExtrudeGeometry` + bevel, merged with `mergeGeometries`) - iterated three times against lead-reported defects (stretched/"balloon" proportions, disconnected wheels, oversized glass canopy) before landing a prescribed five-point construction recipe.
4. Added a four-body variant system (`carBodyProfiles.ts`: coupe/striker/muscle/wedge as data), reactive to `useGameStore((s) => s.carBody)` with per-variant memoised/cached geometry for instant HMR swap, keeping the CarBody swap-contract (sprung body vs wheels, `sync()`, chassis-local space, zero per-frame allocation) identical across all four.
5. Tuned car paint materials: body `roughness={0.26} metalness={0.42} clearcoat={1} clearcoatRoughness={0.06}`, plus rim/tyre roughness-metalness passes.
6. Built `particles.ts` (pooled `InstancedMesh` drift smoke/dust, ~200-400 quads, deterministic LCG, zero per-frame allocation) and `skidmarks.ts` (1400-quad ring-buffer mesh using `BufferAttribute.addUpdateRange`, age-fade in the vertex shader), tied together in a rewritten `FxRoot.tsx`.
7. Diagnosed and fixed a black-canvas blocker: `BufferGeometryUtils.mergeGeometries` returns `null` when mixing indexed (`Box`/`Cylinder`/`Torus`/`Lathe`) and non-indexed (`Extrude`) geometries; fixed by flattening every part via `.toNonIndexed()` and replacing non-null assertions with descriptive throws.
8. Diagnosed and fixed whole-face roof z-fighting across all four car bodies: the `roof` band's top-edge points were literal copies of the `glass` roof points (same plane). Fixed geometrically - `GLASS_ROOF_DROP = 0.022` (22mm) applied uniformly to every glass point plus `GLASS_SIDE_SHRINK = 0.005` (5mm) per flank, verified with a 200-sample numeric audit (worst-case gap 6.5mm, was 0.0mm) - explicitly not `polygonOffset`.
9. Verified final perf on a fresh `?demo=1` reload: avg 1.25ms, p99 1.70ms, steady 60fps, 73 draw calls, ~1.05M tris, clean console; confirmed no uncommitted changes on owned files before approving team-lead's shutdown request.

## Key Decisions

| Decision | Rationale |
|---|---|
| Flatten all geometry parts to non-indexed before `mergeGeometries`, throw descriptively on `null` | Extrude geometry is non-indexed while Box/Cylinder/Torus/Lathe are indexed; silent `!` assertions on a `null` merge produced a black canvas with per-frame crashes - a loud failure at mount beats that |
| Fix roof z-fight with real geometric separation (22mm drop + 5mm shrink), never `polygonOffset` | Explicit lead instruction; polygon offset masks coincident-plane bugs rather than removing them, and doesn't survive all camera angles |
| Car body variants selected once at mount from the store, cached per variant | Zero per-frame cost, instant HMR swap, `sync()`/wheel contract stays identical across all four bodies |
| Custom `grade.ts` procedural colour-grade instead of relying solely on stock HueSaturation/BrightnessContrast passes | Needed a specific warm-highlight/teal-shadow golden-hour look plus a later olive push for front-lit greens that stock passes couldn't combine cleanly |
| Moved the `PCFSoftShadowMap` deprecation-warning fix from `useEffect` to the first `useFrame` tick | React runs child effects before parent ones, and `<Canvas>` re-applies the shadow map type after mount, so a `useEffect` fix got overwritten |

## Files Created

| File | Description |
|---|---|
| `src/fx/skyEnv.ts` | Procedural PMREM environment map agreeing with the sky dome / sun direction |
| `src/fx/grade.ts` | Custom golden-hour colour-grade post-effect |
| `src/fx/SunFlare.tsx` | Sun-disc flare mesh sourced from `getSunDirection()` |
| `src/fx/particles.ts` | `Puffs` pooled instanced drift-smoke/dust system, zero per-frame allocation |
| `src/fx/skidmarks.ts` | `SkidMarks` ring-buffer mesh using `addUpdateRange`, age-fade shader |
| `src/vehicle/carBodyProfiles.ts` | Four `BodySpec` data variants (coupe/striker/muscle/wedge) + shape-building helpers |

## Files Modified

| File | Description |
|---|---|
| `src/fx/Lighting.tsx` | Golden-hour directional sun + shadow rig, hemisphere fill, fog, environment |
| `src/fx/Effects.tsx` | `EffectComposer` stack (SMAA, tonemapping, Bloom, Vignette, grade) |
| `src/fx/FxRoot.tsx` | Rewritten to drive smoke + dust + skidmarks off telemetry in one `useFrame` |
| `src/vehicle/CarBody.tsx` | Rewritten several times - procedural coupe geometry, four-variant support, paint/glass/wheel material tuning, hardened `mergeGeometries` handling |

## Next Steps

- [ ] None outstanding from this worker - team-lead issued an unconditional DONE shutdown request; worker confirmed a clean working tree on all owned files before approving.

## Related Sessions

- This session ran concurrently (2026-07-09) with two sibling worker sessions in this same project:
  - sessions/2026-07-09-world-worker-terrain-physics.md (world worker - terrain/scatter/collision)
  - sessions/2026-07-09-vehicle-worker-physics-tuning.md (drive worker - vehicle physics/tuning)
