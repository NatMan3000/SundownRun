---
type: auto
session_id: e7c95ed0-1878-4920-9115-5778087be3af
project: SundownRun
date: 2026-07-09
topic: Orchestrated end-to-end build - 4 parallel Opus workers (world/drive/look/avui) + 2 independent checkers, blank repo to unconditional DONE
duration: ~5.6h span (6 concurrent sessions)
events: 1935
---

# Sundown Run - Orchestrated Build (2026-07-09)

Blank repo to shipped, unconditional sign-off in a single orchestrated multi-agent day. Four long-lived Opus worker agents owned disjoint slices of the repo behind frozen core contracts (config / telemetry / store / terrain API) so no two agents touched the same files, and two fresh-context checker agents re-executed every claim against an isolated production preview rather than trusting worker reports. Coordinated through the Nexus cluster kanban (project 45, "Sundown Run").

## Lead

**No distinct lead among these six sessions** - all four were parallel slice-workers and two were independent checkers. The build was driven by the separate orchestrator session `2026-07-09-sundown-run-full-build.md` (out of scope for this consolidation - left in place). Anchored here on the **WORLD worker** (tied-longest at 5.6h, richest at 459 events).

**Anchor - World worker:** `claude -r e7c95ed0-1878-4920-9115-5778087be3af`

- Owned `src/world/**` + `src/core/terrain.ts`; built terrain/road/sky/vegetation from scratch: a 3865m closed circuit (two crest jumps, a 30m hairpin), fbm terrain welded to the road within 2mm, procedural golden-hour sky dome, 3 instanced tree species + rocks + wind-swayed grass, static rapier colliders - all inside the 300-draw-call / 1.5M-triangle budget.
- Empirically determined rapier's heightfield index ordering (`iz + ix*(N+1)`, not the naive layout) via a raycast probe before writing the frozen terrain API, avoiding a silent 90-degree collision-vs-visual mismatch; diagnosed the rapier heightfield tunnelling limitation (infinitely-thin colliders, CCD does not arm) with a catch-floor slab + below-terrain auto-reset backstop.
- Sealed the world boundary (W1, physically-contained bowl), built tree-smash (W2, per-instance `useBeforePhysicsStep` collider disarm on fast hits), the checkered start line (W3, caught a back-face-culling winding bug via screenshot), and 4 off-track playground jumps.
- Reworked the mountain skyline twice against art-direction ("custard wall" rejection, then the D-FOG atmospheric-bridge fix baking warm-haze vertex colour toward fog). Verified every change against a from-scratch headless rapier harness (grew to 19/19), twice catching its own probe bugs before filing.

## Workers

### Worker - Drive (vehicle physics, input, camera, lap validity)

**Restart ID:** `claude -r e6e66a4e-524a-48d8-935f-f1587a4835c2` (407 events, 5.6h)

- Owned `src/vehicle/**`, `src/core/input.ts`, `src/dev/**`. Built the raycast-suspension car (springs/dampers, engine force, speed-sensitive steering, lateral tyre slip/drift, handbrake rear-grip cut), hot-swap keyboard/gamepad input, critically-damped chase camera with mode cycling, lap timing, and the `?demo=1` autopilot + perf harness - all grounded in real rapier `.d.ts` signatures grepped from `node_modules` rather than guesswork.
- Added a finiteness firewall around every value crossing into rapier (forces, torques, teleport, smoothed inputs) after a reported "crash"; reproduced the report on a scratch tab first and found the lead's bisect had swapped out other workers' uncommitted files, so attribution wasn't isolated - added the NaN/Infinity guards as the real fix regardless.
- Iterated five fix rounds (crash hardening, camera cycling, steering recalibration across the 0.6-1.6 knob range, two new reset tiers) and built a real-keyboard-input lap-completion harness, landing a clean 1:55.2 lap at 100% on-road before the unconditional DONE ruling.

### Worker - Look / FX (lighting, post-processing, car body, driving FX)

**Restart ID:** `claude -r 801b5b0d-68c0-47b1-8d2f-7aba21529c50` (465 events, 4.7h)

- Owned `src/fx/**` + `src/vehicle/CarBody.tsx` (0 direct user prompts - all direction via the orchestrator). Built the golden-hour lighting rig (warm directional sun, 2048 car-following shadow frustum, hemisphere fill, PMREM `skyEnv.ts`), the `@react-three/postprocessing` grade stack (SMAA, ACES, Bloom, Vignette, custom `grade.ts`), and `SunFlare.tsx`.
- Rebuilt `CarBody.tsx` three times against lead feedback into a procedural coupe, then added a four-variant data system (coupe/striker/muscle/wedge) with per-variant cached geometry and an identical swap contract.
- Diagnosed the `mergeGeometries` black-canvas blocker (returns `null` silently when mixing indexed/non-indexed geometries - fixed by flattening to non-indexed + throwing descriptively) and whole-face roof z-fighting (glass points copied from the roof plane - fixed geometrically with a 22mm drop + 5mm shrink, never `polygonOffset`, verified by a 200-sample numeric audit).
- Built pooled instanced drift-smoke `particles.ts` and ring-buffer `skidmarks.ts` (both zero per-frame allocation). Final perf on a fresh `?demo=1`: avg 1.25ms / p99 1.70ms, 60fps, 73 draw calls, ~1.05M tris.

### Worker - AV-UI (audio, HUD, garage, sun-shard delights)

**Restart ID:** `claude -r 14f618d4-ccd8-4c90-879a-e0c80a1f60b0` (273 events, 5.4h)

- Owned `src/audio/**`, `src/ui/**`, `src/world/Delights.tsx`. Built a fully procedural WebAudio engine (zero audio files: `ConstantSourceNode` frequency bus feeding layered oscillators through shared lowpass + waveshaper, plus skid/wind/road noise beds and a one-shot SFX bus), a warm golden-hour HUD (rAF speed/gear at 15Hz, lap panel, shard counter, toasts), and a title-card garage selector.
- Built `Delights.tsx`: 10 instanced allocation-free sun shards placed via measured spline fractions, with air-shard speed-gates set by in-browser physics measurement (grounded gap 3.75m vs 3.5m pickup radius) rather than guesswork.
- Added a steering-sensitivity slider (0.6-1.6) with a load-bearing fix: claimed all four arrow keys in the capture phase so `ArrowUp` never leaks a throttle blip that auto-dismisses the title card. Iterated three product-owner defect rounds (intro-card scrim readability, chevron glyphs, restart/menu hints).
- Flagged (not owned): `window.__game.renderInfo()` reads the post-composer's final pass once the look worker's post stack lands, making the draw-call/triangle budget unmeasurable through that handle.

## Checkers

### Checker-1 - independent phase-1 verification (world + vehicle)

**Restart ID:** `claude -r ae49eadc-0b69-478e-a050-bd04fbb65de1` (105 events, 5.4h)

- Re-executed every claim against an isolated `:5299` production preview (not the live `:5199` dev server), per the constitution's re-execute protocol; confirmed the bundle predated the look worker's post-stack by 24 min so lighting/post defects were correctly deferred to phase 2.
- **Found the central blocker (D1):** after a brief handbrake tap with all inputs released, drift angle grows monotonically -36 to -179 degrees with zero player input - the car spins itself to facing backwards. Traced to `useVehiclePhysics.ts` (yaw damping cuts to 31% while rotating fastest, no restoring torque, positive feedback). Ruled phase 1 not true-done.
- Independently re-instrumented perf with a second rAF probe to validate the harness's own numbers (both agreed: avg 1.27-1.56ms JS, 60fps); proved the circuit closes (full autopilot lap, returned within 1.5m after 3836.8m, 0% off-road); killed two false alarms before filing. Verdict → `scratchpad/checks/checker1-verdict.md`.

### Checker-2 - final verification (full-look build, section-5 hard rules, GPU perf)

**Restart ID:** `claude -r faec0929-3f6f-4b95-9088-d1e6a554bbdc` (226 events, 1.5h)

- Verified the full-look build (post stack, shadows, audio, all colliders) against `CONSTITUTION.md` after D1's fix. Confirmed D1 fixed: hands-off handbrake now peaks at 18.9 degrees and self-straightens to 2.4 degrees by 2.6s (was 179), while a held drift stays alive - a proper catchable arcade drift.
- Signed off the section-2 perf budget with a **real GPU timer** (`EXT_disjoint_timer_query_webgl2`), closing checker-1's stated JS-only blind spot: avg 2.0ms / p99 4.4ms GPU alongside 1.1-1.25ms JS, 60fps over two 1800-frame runs, 73 draw calls, 1.05M tris - all inside budget with the full look stack.
- Verified both new section-5 hard rules (world containment on 3 high-speed bearings incl. a 174km/h rim ram; trees solid <40km/h, smash >50km/h), the anti-cheat trio (circling never increments lapCount; clean lap sets bestLapMs; cut lap sets `lastLapDirty` without bestLapMs), and the clean-clone gate (`git clone` → `bun install && bun run build` → serve on `:5499`, drove 3s).
- Survived a mid-session Chrome crash (wrote an honestly-labelled interim verdict naming exactly which checks were browser-blocked, then resumed), confirmed the Nathan-flagged D-FOG fix (`995206c`) via before/after A/B, and issued the final **unconditional DONE** ruling. Verdict → `scratchpad/checks/checker2-verdict.md`.

## Merged Key Decisions

| Decision | Owner | Rationale |
|---|---|---|
| Frozen core contracts (config/telemetry/store/terrain) so workers own disjoint slices | orchestrator | Multiple agents edit the repo with zero merge conflicts |
| Determine rapier heightfield row/column order empirically before writing the terrain API | world | A wrong guess rotates the collision world 90 degrees while looking perfect |
| Catch-floor slab + below-terrain auto-reset for heightfield tunnelling | world | Infinitely-thin colliders + CCD-won't-arm is an engine constraint, not tunable away |
| Mountains dissolve via per-vertex alpha-to-zero + warm-haze vertex-colour bridge, not fog-to-colour | world | A fogged silhouette reads as a hard-edged slab against a gradient sky (the D-FOG fix) |
| Finiteness firewall around every value entering rapier | drive | Cheap NaN/Infinity insurance regardless of the un-isolated "crash" origin |
| Reproduce a bug report on a fresh scratch tab before accepting attribution | drive | The lead's bisect swapped out other workers' uncommitted files - blame wasn't isolated |
| Real-keyboard lap harness (not just analog autopilot) for final acceptance | drive | Proves the actual digital player path meets on-road/sweeper/hairpin bars |
| Flatten geometry to non-indexed before `mergeGeometries`, throw on `null` | look | Silent `!` assertions on a null merge produced a black canvas + per-frame crashes |
| Roof z-fight fixed with real geometric separation (22mm/5mm), never `polygonOffset` | look | Polygon offset masks coincident-plane bugs and doesn't survive all camera angles |
| Custom `grade.ts` procedural colour-grade over stock passes | look | Stock passes can't cleanly combine warm-highlight/teal-shadow + later olive push |
| Single `ConstantSourceNode` frequency bus for all engine oscillators | avui | One parameter write moves the whole harmonic stack; layers can't detune relative |
| Air-shard speed-gates set by measured physics, not guesswork | avui | In-browser measurement (3.75m gap vs 3.5m radius) tuned shards to require real air |
| Claim all arrow keys in capture phase for the steering slider | avui | `ArrowUp` is throttle; without capture-phase interception, browsing steering auto-dismisses the title card |
| Ruled phase 1 not true-done on one hands-off-spin blocker (D1) | checker-1 | Constitution names a "catchable" drift; a hands-off spin to backwards fails that for a 12-year-old |
| Real GPU timer (not JS-only) for the section-2 sign-off | checker-2 | The full post+shadow build was the one that needed the true GPU number |
| Interim honestly-labelled partial verdict on the Chrome crash | checker-2 | A verdict naming which checks ran beats silence or an unlabelled guess |
| Final ruling: DONE, unconditionally | checker-2 | Every checked constitution clause passed on own tool-result evidence; D-FOG re-verified fixed first |

## Merged Files

**Created:**

- **world:** `src/world/World.tsx`, `sun.ts`, `textures.ts`, `heightfield.ts`, `scatter.ts`, `geometry.ts`, `wind.ts`, `SkyDome.tsx`, `Terrain.tsx`, `Road.tsx`, `Trees.tsx`, `Grass.tsx`, `Rocks.tsx`, `Mountains.tsx`, `Colliders.tsx`, `boundary.ts`, `treeSmash.ts`, `StartLine.tsx`; `scratchpad/checks/physics-harness.ts` (19/19), `world-worker-fixes.md`
- **drive:** `src/core/input.ts`, `src/vehicle/useVehiclePhysics.ts`, `Vehicle.tsx`, `CarBody.tsx` (placeholder w/ visual contract), `ChaseCamera.tsx`, `carVisual.ts`, `vehicleSignals.ts`, `lapTracker.ts`, `tuning.ts`, `TempGround.tsx` (temp self-test collider), `src/dev/DemoDrive.tsx`; `scratchpad/checks/drive-worker-fixes.md`
- **look:** `src/fx/skyEnv.ts`, `grade.ts`, `SunFlare.tsx`, `particles.ts`, `skidmarks.ts`; `src/vehicle/carBodyProfiles.ts`
- **avui:** `src/audio/synth.ts`, `AudioEngine.ts`; `src/ui/hudStyles.ts`, `IntroCard.tsx`, `format.ts`
- **checkers:** `scratchpad/checks/checker1-verdict.md`, `checker2-verdict.md`, `Build Screenshots/03-check1-*.jpeg`, `scratchpad/checks/c2-*.png`

**Modified:** `src/core/terrain.ts` (world), `src/fx/Lighting.tsx` (world one-line FOG_NEAR grant + look full rig), `src/fx/Effects.tsx`, `FxRoot.tsx`, `src/vehicle/CarBody.tsx` (look rewrite), `src/dev/DevTools.tsx` (drive), `src/vehicle/*` steering/camera/reset (drive), `src/audio/AudioSystem.tsx`, `src/ui/HUD.tsx`, `src/world/Delights.tsx` (avui).

## Merged Next Steps

- ⬜ `ESC → menu` needs a store-level owner (a `menu` flag in `core/store.ts`); `IntroCard` currently can't remount once dismissed (avui).
- ⬜ `window.__game.renderInfo()` should read `gl.info` before the post-composer resets so the draw-call/triangle budget stays measurable (avui).
- ⬜ Gamepad HUD hint path is code-only, untested - no pad attached during the session (avui).
- ⬜ Flip off `TempGround.tsx`'s temporary collider once world's terrain colliders are confirmed integrated (drive/world handoff).
- ✅ D1 handbrake-spin blocker fixed and re-verified DONE (checker-2); D2 lap-state exposed on `window.__game`; D5 telemetry.slip; D3 shadows - all actioned.
- ✅ Shipped: checker-2 unconditional DONE, board closed by the team lead.

## Gotcha (carried forward)

Running many WebGL preview tabs concurrently while chrome-devtools MCP hammers `take_screenshot`/`evaluate_script` can OOM/crash Chrome mid-session. Recovery needs a manual `/mcp` reconnect (ToolSearch alone won't restore the bridge). On a mid-sweep crash, write an interim verdict immediately labelling which checks completed before continuing.

## Related Sessions

- `sessions/2026-07-09-sundown-run-full-build.md` - orchestrator session that drove this whole build (out of scope for this consolidation).
- `sessions/2026-07-11-playground-orchestrated-build.md` - the follow-on Playground phase reusing this frozen-contract parallel-worker pattern.
