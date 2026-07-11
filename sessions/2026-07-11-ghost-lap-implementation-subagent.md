---
type: auto
session_id: e8c83ee4-094c-4127-957e-6f501357fb1a
project: SundownRun
date: 2026-07-11
topic: Ghost-lap feature implementation (delegated subagent build)
duration: 21 minutes
events: 52
---

**Session Restart ID:** `claude -r e8c83ee4-094c-4127-957e-6f501357fb1a`

## Summary

This session is the Opus engineer subagent ("ghostlap") spawned by the parent session (`bcab4da2`) to implement the ghost-lap racing feature - a translucent replay of the player's own best lap. It designed and built the full record → persist → replay pipeline, verified it as far as its available tooling allowed (build/typecheck clean, a headless bun pipeline test), and reported back. No browser/GPU tooling was reachable from this subagent's environment, so live visual verification was explicitly flagged as unverified and left to the parent session, which did complete it and committed the work as `c192909` (see `sessions/2026-07-11-playground-phase-tricks-scoring-crash-props.md`).

## What We Did

1. Grounded in `CONSTITUTION.md`, `store.ts`, `config.ts`, `useVehiclePhysics.ts`, `lapTracker.ts`, `carVisual.ts`, `telemetry.ts`, `vehicleSignals.ts`, `Vehicle.tsx`, `CarBody.tsx`, `App.tsx`, `DevTools.tsx`, `tuning.ts`, and `DemoDrive.tsx` before writing any code.
2. Built `src/vehicle/ghost.ts`: a recorder singleton that decimates the 60Hz physics-step pose to a fixed 20Hz into preallocated `Float32Array`s (zero per-step allocation, capped at 300s), plus compact encode/decode (positions as cm-integers, quaternions as milli-unit integers) for `localStorage`.
3. Wired the recorder lifecycle into `lapTracker.ts` (owns begin/dirty/complete/void/teleport transitions) and added one `ghostRecorder.sample()` call late in the `useVehiclePhysics.ts` step.
4. Built `src/vehicle/GhostCar.tsx`: reads the persisted trace, lerps position + slerps rotation time-synced to the player's live lap clock, renders a single translucent emissive shell reusing the recorded car's cached geometry (no physics body, no per-frame allocation).
5. Extended `store.ts` with a `ghostVersion` + `bumpGhost` reactive nonce (trace itself stays out of the store, following the existing telemetry/carVisual pattern) and added `ghost`/`ghostColor`/`ghostOpacity` kid knobs to `config.ts`.
6. Verified: `bun run build` and `bun run typecheck` both clean. No chrome-devtools or claude-in-chrome MCP tools were loadable in this environment, so wrote a headless bun script exercising the real `ghost.ts` pipeline end-to-end (record → 20Hz decimate → commit → localStorage round-trip → decode → interpolation) - all assertions passed (3.0s → exactly 60 samples, round-trip within 2cm, ~96KB projected for a 3-minute lap, max interpolated jump 0.80m at ~50m/s with no discontinuity). Removed the scratch test file after.
7. Reported to the parent session twice - via `SendMessage` was attempted but that tool was not present in this subagent's toolset (`ToolSearch` returned no match for every query form tried), so the full report was delivered as a direct text reply instead. The parent chased it for the report both times before finding it in the transcript itself.
8. Left the working tree uncommitted per instructions - the parent session verified live in-browser and committed as `c192909`.

## Key Decisions

| Decision | Rationale |
|---|---|
| Ghost wears the body it was recorded with, not the live garage pick | A faithful replay of the run that set the record; a new best in a different car replaces both trace and body on commit |
| Ghost state kept out of the zustand store (only a version nonce lives there) | Follows the existing telemetry/carVisual pattern - the trace itself doesn't need to be reactive, only "did it change" |
| Recording halts at the dirty-lap transition | Saves work - a dirty lap can never become a best lap under the existing anti-cheat rule, so there's no reason to keep sampling |

## Files Created

| File | Description |
|---|---|
| `src/vehicle/ghost.ts` | Recorder singleton, persisted-trace type, compact encode/decode, live `ghostState` singleton |
| `src/vehicle/GhostCar.tsx` | Translucent replay car renderer, no physics body |

## Files Modified

| File | Change |
|---|---|
| `src/core/config.ts` | New `ghost`, `ghostColor`, `ghostOpacity` kid knobs |
| `src/core/store.ts` | `ghostVersion` + `bumpGhost` trace-changed signal |
| `src/vehicle/lapTracker.ts` | Drives the recorder lifecycle (start/discard/commit) |
| `src/vehicle/useVehiclePhysics.ts` | One `ghostRecorder.sample()` call in the 60Hz physics step |
| `src/vehicle/CarBody.tsx` | Exported `getBody`, `WHEEL_GEOM`, `BodyGeometry` so the ghost reuses the exact cached car meshes |
| `src/App.tsx` | Mounts `<GhostCar />` outside `<Physics>` |
| `src/dev/DevTools.tsx` | `window.__game.ghost*` verification surface |

## Next Steps

- ✅ Completed and shipped - the parent session verified live in-browser (injected synthetic trace, confirmed load → replay → interpolate) and committed as `c192909`.
- ⬜ The record-side of the pipeline (real lap → trace committed) was only verified via a headless synthetic-pose test, not a real full driven lap - the first genuine full lap driven live is the true end-to-end test, per the parent session's own note.

## Open Questions

None left by this subagent (no `UNCERTAIN:` items were raised on the design). The one open gap - live browser/GPU verification - was explicitly flagged for the parent/checker and was subsequently closed by the parent session.

## Related Sessions

- `sessions/2026-07-11-playground-phase-tricks-scoring-crash-props.md` - the parent session that spawned this subagent, verified its work live, and committed it as `c192909`.
