---
type: auto
session_id: bcab4da2-2c77-4bc9-850e-b54b666896aa
project: SundownRun
date: 2026-07-11
topic: Playground phase - orchestrated build (trick scoring, moved start line, mountain runs, crash-prop family, ghost-lap) + 3 parallel workers + ghost subagent
duration: ~4.8h span (5 sessions)
events: 552
---

# Sundown Run - Playground Phase Orchestrated Build (2026-07-11)

A long live playtesting-and-iteration day: Nathan drove the game and reported feel issues in real time while the orchestrator resolved two parked threads (Forgejo remote, ghost-lap), then ran a "Playground phase" - three parallel Opus workers (world/drive/avui) building trick scoring, bouncy rocks, ridge content, and an audio-restart fix on a frozen contract layer - followed by ~12 rounds of direct playtest-driven tuning. Ghost-lap was delegated to a separate Opus subagent, verified live, and committed within the lead session. Reused the frozen-contract parallel-worker pattern proven in the 2026-07-09 build.

## Lead

**Restart ID:** `claude -r bcab4da2-2c77-4bc9-850e-b54b666896aa` (367 events, 4.8h)

- Resolved the **Git remote** thread: created private Forgejo repo `nathan/SundownRun`, repointed `origin` to Forgejo-fetch + dual-push (Forgejo + GitHub), pushed `main`.
- Spawned the **ghost-lap** subagent (see Workers), verified its work directly after it went silent twice (build green + injected synthetic trace in browser to prove load → replay → interpolate), committed `c192909`, resolved the thread.
- Laid the frozen **Playground-phase contract** (`src/core/tricks.ts` seam, `START_LINE_T` in `terrain.ts`, new config knobs) then spawned pg-world / pg-drive / pg-avui in parallel; verified and shipped the integrated phase as `32bff36`.
- Ran ~12 rounds of playtest-driven fixes: scoring-variety rework (quadratic airtime, event-ring HUD fix for the "always CLEAN +50" bug, wipeout wipes score, gate scoring, +2 TIMBER tree-smash), wipeout forgiveness (2-wheel recovery window) + roof-landing regression fix, off-road false-positive fix (ribbon half-width mismatch), rock thinning, a 43m hairpin eased to 98m, and high-score persistence.
- Rebuilt the mountain-edge big-air runs three times to match Nathan's real spec (sculpted pad-chute-kicker → natural gaussian hills → run-up hill removed, mountainside IS the run-up); replaced "weird" starting-gate gantries with sandstone hoodoos, then deleted them and generalised the hay-bale hit-burst into a three-family `CrashProps` system (bales +15 / crates +20 / barrels +25). Set up Josh's editable copy as a second full clone (`SundownRun-Josh`), hardening `Get Updates.bat` to `git clean -fd`.

## Workers

### Worker - World (moved start line, bouncy rocks, ridge arches + jumps)

**Restart ID:** `claude -r 5a5bab02-324a-472f-ad30-23d01b16055e` (40 events, 1.5h)

- Owned `src/world/**` + `src/core/terrain.ts`. Set `START_LINE_T = nearestRoadPoint(-30,-414).t` (~0.07, ~270m forward of t=0) - a world-anchor pattern that survives circuit re-authoring - and reworked `StartLine.tsx` + `getSpawn()` to resolve from `roadSpline` at that t instead of the old `ROAD_DENSE[0]` shortcut.
- Rebuilt rock colliders as buried domes (crown at boulder top, centre ≥0.3m below ground, friction 0.12/Min, restitution 0.75/Max) so glancing hits launch while square hits still cost speed; `bouncyRocks=false` restores old behaviour byte-for-byte.
- Added 5 new spread jumps + a `'ramp'` playground kind for a chainable ridge run, and built `RidgeArches.tsx` (3 thread-the-gate timber gates, one draw call, solid post colliders). `tsc -b` clean in `world/`+`core/`; only failures were the AVUI sibling's file, correctly left untouched.

### Worker - Drive (trick detection + lapTracker START_LINE_T offset)

**Restart ID:** `claude -r b91c3f94-6fbf-4a5c-9a61-463430ae22e7` (37 events, 1.5h)

- Owned `src/vehicle/**`. Built `trickDetector.ts` scoring tricks at landing by integrating body-frame angular rate while airborne (winding-number, so a 720 counts as two spins not a net-zero delta); one air session = one combo chain, scoring only at landing so a crash can void the combo before points bank. Full taxonomy: AIR tiers, `n·180 SPIN`, flips/barrel-rolls + doubles/triples, CLEAN/`COMBO xN`, WIPEOUT (voids). Zero per-step allocation.
- Wired `update()` beside the ghost sample in `useVehiclePhysics.ts` and `cancel()` into all 3 teleport branches so an interrupted jump can't post a phantom landing.
- Generalised `lapTracker.ts` crossing + 8 anti-cheat sector checkpoints to `START = ((START_LINE_T%1)+1)%1` (reduces exactly to the old t=0 scheme); bumped `ghost.ts` `TRACE_VERSION` 1→2 + one-shot stale-record migration. Headless taxonomy check 14/14; `bun run build` green.

### Worker - AVUI (controller-restart audio fix, trick UI, airborne rev-up, wind removal)

**Restart ID:** `claude -r 3c1ef58e-0e1c-4e39-a137-625ac939546c` (56 events, 1.5h)

- Owned `src/audio/**` + `src/ui/**`. **Root-caused the controller-restart silent-audio bug**, disproving the lead's `dispose()` hypothesis (that only runs on unmount, which an in-place restart never triggers): a gamepad button raises no DOM gesture and `IntroCard`'s pad-dismiss path deliberately skips `ensureStarted()`, so a pad-only player never gets audio *built*. Fixed by polling the gamepad (120ms) and calling `ensureStarted()` once the document holds sticky `userActivation` - honest boundary (still needs one prior real gesture per Chromium autoplay policy).
- Built `TrickHud.tsx` against DRIVE's frozen `tricks.ts` contract (committed `5fd937d`) before DRIVE's detector had landed, then verified `emitTrick`/`commitCombo` shapes matched once it did; added muted `WIPEOUT` rendering.
- Mid-session added by Nathan: airborne engine free-rev (pitch was falling because it derived from ground-speed `telemetry.rpm`) and wind-whistle removed outright (not silenced) per Nathan's removal-over-silencing default. Hardened a dispose/rebuild negative-`dt` edge case. `bun run build` green throughout.

### Worker - Ghost-lap (delegated Opus subagent)

**Restart ID:** `claude -r e8c83ee4-094c-4127-957e-6f501357fb1a` (52 events, 21 min)

- Opus engineer subagent ("ghostlap") spawned by the lead to build the ghost-lap feature (translucent best-lap replay). Built `ghost.ts` (recorder decimating the 60Hz pose to 20Hz into preallocated `Float32Array`s, capped 300s, compact int encode/decode for localStorage) and `GhostCar.tsx` (lerp+slerp time-synced to the live lap clock, single translucent emissive shell, no physics body, no per-frame allocation).
- Wired the recorder lifecycle into `lapTracker.ts`, added one `sample()` call in the physics step, extended `store.ts` with a `ghostVersion` nonce (trace stays out of the store), and exported `getBody`/`WHEEL_GEOM`/`BodyGeometry` from `CarBody.tsx` so the ghost reuses the exact cached meshes.
- Verified as far as tooling allowed: `build`+`typecheck` clean, a headless bun pipeline test (record → 20Hz decimate → localStorage round-trip → decode → interpolate, all assertions passed, 3.0s → exactly 60 samples, round-trip within 2cm). No browser MCP reachable in the subagent env, so live visual verification was flagged unverified and left to the parent, which closed it and committed `c192909`.

## Merged Key Decisions

| Decision | Rationale |
|---|---|
| Forgejo fetch + dual push (Forgejo + GitHub) | Matches Kai's standard git-remotes convention; GitHub-only was the gap |
| Verify silent sub-agent/worker output directly rather than chase idles | `ghostlap`, `pg-drive`, `pg-world` all finished but never filed reports (twice each - no `SendMessage` tool in their env); reading the tree + running the build is faster and more reliable |
| Frozen contract layer before parallel spawn (`tricks.ts` seam + `START_LINE_T`) | Prevents the three Playground workers colliding on shared files - proven in the 2026-07-09 build |
| Josh's fork = a second full clone, not a git branch | Two folders can never fight; branches risk merge conflicts and confusing messages for a kid |
| Mountain-edge runs rebuilt as natural gaussian landforms, no sculpted pad/chute/gates | Nathan's actual spec was "big hill you can climb from any side, dip, small mountain to launch off" |
| Starting-gate gantries deleted, not re-skinned; effort moved to the bale-burst system | Even re-skinned as stone monoliths Nathan still found them "weird"; the bale burst was the real hit |
| `START_LINE_T` resolved from a world anchor `(-30,-414)`, not a raw t-value | Survives circuit re-authoring; lands on dead-flat asphalt so the painted band sits square (world) |
| Rock deflection via buried-dome geometry + friction/restitution, not impulse hacks | Impulse hacks read as floaty; shaping the collision surface gives an honest angle-dependent bounce (world) |
| Score tricks at landing only, never mid-air | The only honest way to let a crash void the combo, since `emitTrick` banks points immediately (drive) |
| Integrate body-frame angular rate, not quaternion delta | A trick is a winding number; a delta only yields net 0-360 so a 720 reads as 0 (drive) |
| Disproved the `dispose()` hypothesis; fixed the real gesture-unlock gap | `dispose()` never fires on restart; the gap was gamepad input never counting as a browser gesture (avui) |
| Wind whistle removed outright, not silenced | Matches Nathan's default; road rumble + engine pitch + camera FX already carry speed-feel (avui) |
| Ghost wears the body it was recorded with; ghost state kept out of the zustand store (nonce only) | Faithful replay of the record run; follows the telemetry/carVisual "only did-it-change is reactive" pattern (ghost) |

## Merged Files

**Created:** `src/world/archGates.ts` (later removed), `src/world/CrashProps.tsx` (renamed from `CrashBales.tsx`), `src/world/RidgeArches.tsx` (world), `src/ui/TrickHud.tsx` (avui), `src/vehicle/trickDetector.ts` (drive), `src/vehicle/ghost.ts` + `GhostCar.tsx` (ghost). Ephemeral: `scratchpad/trick-classify-check.ts` (drive, removed).

**Modified:** `src/core/tricks.ts` (new frozen seam + scoring rework), `src/core/config.ts` (`tricks`/`bouncyRocks`/`ghost*` knobs), `src/core/terrain.ts` (`START_LINE_T`, `getSpawn`, corner 43m→98m, off-road ribbon fix, `'ramp'` kind + 7 PLAYGROUNDS entries + 3 mountain-edge rebuilds), `src/core/store.ts` (`ghostVersion`/`bumpGhost`), `src/world/treeSmash.ts` (TIMBER/SIDE SWIPE scoring), `src/world/scatter.ts` (bouncy-dome fields, rocks 640→420), `src/world/Colliders.tsx`, `StartLine.tsx`, `World.tsx`, `src/vehicle/trickDetector.ts`, `lapTracker.ts` (START_LINE_T offset + ghost lifecycle), `useVehiclePhysics.ts` (trick + ghost sample, off-road ribbon width, air-control tune), `ghost.ts` (TRACE_VERSION), `tuning.ts` (air control 900/700 → live 5000/5000), `CarBody.tsx` (ghost geometry exports), `src/ui/TrickHud.tsx`, `HUD.tsx`, `hudStyles.ts`, `src/audio/AudioEngine.ts` (gamepad unlock, `playTrick`, airborne free-rev, wind removed), `src/App.tsx`, `src/dev/DevTools.tsx`, `Get Updates.bat` (`git clean -fd`), `README.md` (two-clone fork).

## Merged Next Steps

- ⬜ Confirm the gamepad-restart audio fix with a real controller - hardware-only, can't verify from a coding session (avui/lead).
- ⬜ A truly fresh load before any gesture: verify no "AudioContext was not allowed to start" warning (avui).
- ⬜ Get Josh's PC on a real `SundownRun-Josh` clone using the documented setup (lead).
- ⬜ Continue playtest tuning on the new mountain-edge runs + crash-prop family feel (lead).
- ⬜ First genuine full driven lap is the true end-to-end ghost record-side test (only the synthetic-pose path was verified) (ghost).
- ✅ Ghost-lap shipped and committed `c192909`; Playground phase integrated as `32bff36`.
- ✅ `getSpawn()` moved to `START_LINE_T` same night (cross-slice flag resolved - world confirmed).

## Related Sessions

- `sessions/2026-07-09-orchestrated-build.md` - the original Sundown Run build; source of the frozen-contract parallel-worker pattern reused here.
- `sessions/2026-07-09-sundown-run-full-build.md` - original orchestrator session.
