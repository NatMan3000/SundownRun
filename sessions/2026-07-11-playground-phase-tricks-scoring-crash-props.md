---
type: auto
session_id: bcab4da2-2c77-4bc9-850e-b54b666896aa
project: SundownRun
date: 2026-07-11
topic: Playground phase - trick scoring, moved start line, mountain runs, crash-prop family, Forgejo remote, ghost-lap kickoff
duration: 4.8 hours
events: 367
---

**Session Restart ID:** `claude -r bcab4da2-2c77-4bc9-850e-b54b666896aa`

## Summary

A long live playtesting-and-iteration session with Josh's dad (Nathan) driving the game and reporting feel issues in real time. Resolved the two parked open threads (Forgejo remote, ghost-lap), then ran a full "Playground phase" - three parallel Opus workers (world/drive/avui) built trick scoring, bouncy rocks, ridge content, and an audio-restart fix on top of a frozen contract layer - followed by roughly a dozen rounds of direct playtest-driven tuning: scoring variety, wipeout sensitivity, off-road detection, a too-tight final corner, mountain-edge big-air runs (rebuilt three times to match Nathan's actual mental model), replacing "weird" starting-gate gantries with stone monoliths, and generalizing a hit-response bale system into a three-family crash-prop system (bales/crates/barrels). Ghost-lap was delegated to a subagent (see the sibling session `e8c83ee4`) and its work was verified and committed in this session.

## What We Did

1. Resolved **Git remote setup** thread: created a private Forgejo repo (`nathan/SundownRun`), repointed `origin` to Forgejo-fetch + dual-push (Forgejo + GitHub), pushed `main`.
2. Spawned an Opus engineer ("ghostlap") to build the ghost-lap racing feature (translucent best-lap replay); the sub-agent went silent without filing its report twice, so this session verified the work directly (build green, injected a synthetic trace in the browser to prove load → replay → interpolate), committed (`c192909`), pushed, and resolved the **Ghost-lap** thread.
3. Diagnosed and explained a real bug: controller-restart kills game audio because the AudioContext gesture-unlock only listens for keyboard/mouse/touch, never gamepad.
4. Laid a frozen "Playground phase" contract (`src/core/tricks.ts` seam, `START_LINE_T` constant in `terrain.ts`, new config knobs) so three parallel workers couldn't collide, then spawned pg-world (rocks/jumps/ridge/line paint), pg-drive (trick detection + line timing), and pg-avui (audio fix + trick UI) in parallel.
5. Verified and shipped the integrated Playground phase (`32bff36`): winding-number trick detection (spins/flips/rolls, airtime tiers), angled-deflector bouncy rocks, new jumps + ridge arch run, one-lifetime AudioContext with gamepad-aware unlock, airborne engine free-rev, wind whistle removed.
6. Ran ~12 rounds of direct playtest-driven fixes across the rest of the session: tree-smash scoring (+2 TIMBER), scoring-variety rework (quadratic airtime points, event-ring HUD fix for the "always CLEAN +50" bug, wipeout wipes score, gate scoring), gate repositioning off the map center, high-score persistence, wipeout forgiveness (2-wheel recovery window) plus a roof-landing regression fix, rock thinning, drift scoring, off-road-detection false-positive fix (ribbon half-width mismatch), and easing a 43m-radius hairpin corner to 98m.
7. Set up Josh's own editable "fork" as a second full git clone (`SundownRun-Josh`) rather than branches - documented in README, hardened `Get Updates.bat` to `git clean -fd` so it's a true full reset.
8. Rebuilt the mountain-edge big-air runs three times chasing Nathan's actual spec: started as sculpted pad-chute-kicker runs, replaced with natural gaussian-hill landforms after Nathan flagged the first version read as a cliff-drop not a jump, then removed the artificial run-up hill entirely (mountainside IS the run-up) and grew the kicker mountain.
9. Replaced the "weird"-looking timber-and-checker starting-gate gantries with sandstone hoodoo pillar pairs (same scoring), then deleted them entirely after continued feedback and generalized the hit-and-burst hay-bale system into a `CrashProps` family: hay pyramids (+15), crate towers (+20), barrel rings (+25) - all re-scattered on every reset.

## Key Decisions

| Decision | Rationale |
|---|---|
| Forgejo fetch + dual push (Forgejo + GitHub) | Matches Kai's standard git-remotes convention; GitHub-only was the gap |
| Verify sub-agent work directly rather than keep chasing silent idles | Both `ghostlap` and later `pg-drive`/`pg-world` finished but never filed reports twice each; reading the tree + running the build is faster and more reliable than re-chasing |
| Frozen contract layer before parallel spawn (`tricks.ts` seam + `START_LINE_T` constant) | Prevents the three Playground workers from colliding on shared files - proven pattern from the original Sundown Run build |
| Josh's fork = a second full clone, not a git branch | Branches risk merge conflicts and confusing messages for a kid; two folders can never fight each other |
| Mountain-edge runs rebuilt as natural gaussian landforms, no sculpted pad/chute/gates | Nathan's actual spec was "big hill you can climb from any side, dip, small mountain to launch off" - not a lane-and-gantry constructed run |
| Starting-gate gantries deleted (not just re-skinned) | Even after re-skinning as stone monoliths, Nathan still found them "weird"; the bale-burst system was the actual hit, so the effort went into generalizing that instead |

## Files Created

| File | Description |
|---|---|
| `src/world/archGates.ts` | Gate scoring/collision logic (later removed in the final crash-props generalization) |
| `src/world/CrashProps.tsx` | Generalized burst-prop family (bales/crates/barrels), renamed from `CrashBales.tsx` |

## Files Modified

| File | Change |
|---|---|
| `src/core/tricks.ts` | New frozen trick-event seam (nonce-polled mutable singleton, persisted best combo); scoring rework (quadratic airtime, drift scoring) |
| `src/core/config.ts` | New `tricks`, `bouncyRocks` kid knobs |
| `src/core/terrain.ts` | `START_LINE_T` constant; final-corner radius eased 43m→98m; off-road ribbon-width fix; mountain-edge big-air landforms (3 rebuild rounds) |
| `src/world/treeSmash.ts` | Tree-smash scoring (+2 TIMBER, later +5 SIDE SWIPE for flank hits) |
| `src/vehicle/trickDetector.ts` | Winding-number spin/flip/roll detection, continuous quadratic airtime scoring, drift scoring, wipeout-on-inverted-reset fix |
| `src/ui/TrickHud.tsx` | Event-ring fix (was showing only the last of a landing's trick chain), HIGH SCORE row, drift shouts |
| `src/world/Colliders.tsx` | Angled-deflector rock colliders, gate/prop lifecycle wiring |
| `src/world/RidgeArches.tsx` | Stone-monolith gate re-skin, then removed in the crash-props generalization |
| `Get Updates.bat` | `git clean -fd` full-reset hardening for Josh's copy |
| `src/vehicle/tuning.ts` | Air control authority raised (900/700 → 1500/1200, then Nathan's live 5000/5000 tune kept) |
| `src/world/scatter.ts` | Rock density thinned (640 → 420) |
| `src/vehicle/useVehiclePhysics.ts` | Off-road detection now tests against actual ribbon half-width including hairpin flare |
| `README.md` | Josh's two-clone "fork" setup documented |

## Next Steps

- ⬜ Confirm gamepad-restart audio fix with a real controller (can't verify from a coding session).
- ⬜ Get Josh's PC on a real `SundownRun-Josh` clone using the documented setup.
- ⬜ Continue playtest tuning on the new mountain-edge runs and crash-prop family feel.

## Related Sessions

- `sessions/2026-07-11-ghost-lap-implementation-subagent.md` - the delegated ghost-lap build, verified and committed within this session as `c192909`.
- `sessions/2026-07-09-sundown-run-full-build.md` and worker traces - source pattern for the frozen-contract parallel-worker approach reused here.
- `sessions/2026-07-11-playground-worker-world-terrain-rocks-arches.md` - WORLD worker trace (start line, bouncy rocks, ridge arches + jumps).
- `sessions/2026-07-11-playground-worker-drive-tricks-lap-offset.md` - DRIVE worker trace (trick detection, `lapTracker` offset).
- `sessions/2026-07-11-playground-worker-avui-audio-fix-trick-ui.md` - AVUI worker trace (controller-restart audio fix, trick UI, airborne rev-up, wind removal).
