---
type: auto
session_id: e6e66a4e-524a-48d8-935f-f1587a4835c2
project: CarDriveGame3d
date: 2026-07-09
topic: Drive worker - vehicle physics, input, camera and lap validity
duration: 5.6 hours
events: 407
---

# Drive Worker: Vehicle Physics, Input, Camera and Lap Validity

**Duration:** 5.6 hours
**Participants:** Nathan, Kai
**Session Restart ID:** `claude -r e6e66a4e-524a-48d8-935f-f1587a4835c2`

Ran as the DRIVE WORKER teammate in the "Sundown Run" multi-agent build (see the sibling full-build session log), owning `src/vehicle/**`, `src/core/input.ts`, and `src/dev/**`. Built the raycast-suspension car physics, tyre slip/drift model, hot-swap keyboard/gamepad input, chase camera, lap timing, and a demo-drive perf harness from a blank stub, then iterated through five rounds of live fixes (crash hardening, camera cycling, steering recalibration, reset tiers, lap-validity acceptance tests) before being ruled unconditionally DONE and shut down.

## What We Did

1. Investigated the `@react-three/rapier` + `rapier3d-compat` API surface in depth via `node_modules` `.d.ts` greps (`castRay`, `RayColliderHit`/`RayColliderToi`, `setAdditionalMassProperties`, `resetTorques`, `worldCom`, collider mass/density, `ActiveEvents`/contact-force handlers, `QueryFilterFlags`) to ground the raycast-suspension design in real, confirmed signatures rather than guesswork.
2. Built the vehicle physics stack from stubs: `useVehiclePhysics.ts` (4-wheel raycast suspension, spring/damper, engine force, speed-sensitive steering, lateral tyre slip curve for drifting, handbrake rear-grip cut), `Vehicle.tsx`, `CarBody.tsx` (documented chassis/wheel prop contract for the later fx-worker re-skin), `carVisual.ts`, `vehicleSignals.ts`, `lapTracker.ts`, `tuning.ts`, plus a `TempGround.tsx` self-test collider clearly marked for orchestrator removal at integration.
3. Built `src/core/input.ts`: keyboard + Gamepad API hot-swap (whichever device last produced input wins), analog response curve on the stick, attack/release smoothing on digital keys, R/Y reset wiring.
4. Built `ChaseCamera.tsx` with critically-damped spring follow, velocity-direction drift read, speed-scaled FOV/shake, impact kick, and later a full camera-mode cycle (chase/close/bonnet) with eased rig transitions.
5. Built the `?demo=1` autopilot + perf harness (`DemoDrive.tsx`, `DevTools.tsx`) recording real per-frame timings to `window.__perf`.
6. Diagnosed and hardened against a reported "rapier crash" attributed to the drive worker: reproduced first on a scratch tab before accepting attribution, found the lead's bisect had swapped out *all* uncommitted files (including other workers' half-finished terrain/geometry code) so the attribution wasn't isolated - added a finiteness firewall around every value crossing into rapier (forces, torques, `teleportToRoad`, input smoothing) as the real fix regardless.
7. Recalibrated steering twice against changing store contracts (lateral-g targets, dead-zone elimination across the 0.6-1.6 knob range) and added two new reset tiers (Shift+R restart-at-spawn, Escape-to-menu).
8. Built and iteratively fixed a page-side "real keyboard input" lap-completion test harness (cross-track + yaw-rate-damped pursuit steering, backward speed-profile braking) to prove full-lap acceptance criteria under actual digital input, working through confounds along the way (stale reset points, a frozen-rAF background tab, a stale `lapCount > 0` completion check) before landing a clean 1:55.2 lap at 100% on-road with the sweeper and hairpin acceptance bars both cleared.
9. Verified typecheck/build clean and zero console/rapier errors after every round; approved shutdown once the checker's unconditional DONE ruling came through.

## Key Decisions

| Decision | Rationale |
|---|---|
| Investigate rapier's actual `.d.ts` signatures before writing physics code | Raycast suspension, mass properties, and torque APIs are easy to get subtly wrong from memory; grepping `node_modules` confirmed exact method names/shapes up front |
| Add a finiteness firewall around every value crossing into rapier (forces, torques, teleport, smoothed inputs) | The reported "crash" didn't reproduce and wasn't isolated to this worker's files, but NaN/Infinity guards are cheap insurance against exactly this failure class regardless of origin |
| Reproduce a bug report on a fresh scratch tab before accepting attribution | The lead's bisect had swapped out other workers' uncommitted files too, so blame wasn't isolated - verifying first avoided fixing a phantom bug in the wrong place |
| Build a real-keyboard-input lap harness (not just the analog autopilot) for final acceptance | Proves the actual player input path (digital, not overridden analog) meets on-road/sweeper/hairpin bars, not just what the autopilot's smoother inputs can achieve |
| TEMP ground collider gated behind a constant, defaulting ON during self-test | Let physics work be tested before the world worker's terrain colliders landed, with an explicit orchestrator flip-off note to prevent double colliders at integration |

## Files Created

| File | Description |
|---|---|
| `src/core/input.ts` | Keyboard + Gamepad hot-swap input layer with analog curve and digital smoothing |
| `src/vehicle/useVehiclePhysics.ts` | Raycast-suspension physics hook: springs/dampers, engine force, tyre slip/drift model |
| `src/vehicle/Vehicle.tsx` | Composes physics hook, CarBody, and lap tracker |
| `src/vehicle/CarBody.tsx` | Placeholder car mesh with documented chassis/wheel visual contract for the fx worker |
| `src/vehicle/ChaseCamera.tsx` | Critically-damped chase camera with drift-read, FOV/shake, impact kick, and mode cycling |
| `src/vehicle/carVisual.ts`, `vehicleSignals.ts`, `lapTracker.ts`, `tuning.ts` | Supporting vehicle modules: visual signal contracts, lap-progress tracking, tunable constants |
| `src/vehicle/TempGround.tsx` | Temporary self-test ground collider, gated for orchestrator removal at integration |
| `src/dev/DemoDrive.tsx` | `?demo=1` autopilot + real-frame-time perf recorder (`window.__perf`) |
| `scratchpad/checks/drive-worker-fixes.md` | Running fix-round reports (crash hardening, camera cycle, steering recalibration, reset tiers, lap acceptance) |

## Files Modified

| File | Description |
|---|---|
| `src/dev/DevTools.tsx` | Extended with camera-mode debug output and `window.__game.renderInfo` kept live |
| `src/vehicle/*` (steering, camera, reset logic) | Recalibrated across five fix rounds as the store contract and acceptance bars changed |

## Next Steps

- [ ] Orchestrator to flip off `TempGround.tsx`'s temporary collider once world's terrain colliders are confirmed integrated (noted as still-relevant risk if not already actioned)
- [ ] No outstanding drive-worker defects at shutdown - checker-2 ruled unconditional DONE

## Related Sessions

- This session ran concurrently (2026-07-09) with two sibling worker sessions in this same project:
  - sessions/2026-07-09-world-worker-terrain-physics.md (world worker - terrain/scatter/collision)
  - sessions/2026-07-09-fx-postprocessing-worker.md (FX/post-processing worker - lighting/materials/particles)
