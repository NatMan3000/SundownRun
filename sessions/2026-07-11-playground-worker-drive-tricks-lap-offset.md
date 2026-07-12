---
type: auto
session_id: b91c3f94-6fbf-4a5c-9a61-463430ae22e7
project: SundownRun
date: 2026-07-11
topic: Playground-phase DRIVE worker - trick detection + lapTracker START_LINE_T offset
duration: 1.5 hours
events: 37
---

**Project:** SundownRun
**Purpose:** DRIVE-slice worker in the 3-agent parallel playground-phase build (siblings: WORLD on `src/world/**`+terrain, AVUI on `src/ui/**`+`src/audio/**`) - build trick detection (airtime/spins/flips/combos) off the physics step, and generalise lap timing to follow the WORLD sibling's `START_LINE_T`.
**Duration:** 1.5 hours
**Participants:** Nathan, Kai
**Session Restart ID:** `claude -r b91c3f94-6fbf-4a5c-9a61-463430ae22e7`

## Summary

Delegated worker session owning `src/vehicle/**`. Built a new `trickDetector.ts` that scores tricks at landing by integrating body-frame angular rate while airborne (a winding-number approach, so it correctly counts a 720 as two spins rather than a net-zero delta), wired it into the physics step alongside the ghost recorder, generalised `lapTracker.ts`'s crossing/sector-checkpoint math to `START_LINE_T`, and added a one-shot migration to wipe stale ghost/best-lap state after the line moved. Verified the trick taxonomy headlessly (14/14 pass) since no browser was available in the worker's environment; `bun run build` green.

## What We Did

1. Read `CONSTITUTION.md`, `core/tricks.ts` (frozen contract), `useVehiclePhysics.ts`, `ghost.ts`, `lapTracker.ts`, `telemetry.ts`, `config.ts`, `terrain.ts`, `tuning.ts`, `store.ts` to ground in the ownership boundaries and existing telemetry/state-export patterns (`lapState`, `ghostState`, `window.__game`).
2. Wrote `trickDetector.ts`: one air session = one combo chain (takeoff = all 4 wheels off, close = first wheel down); scoring happens only at landing (never mid-air) so a crash can void the combo before `emitTrick` banks points. Rotation measured via body-frame angular-rate integration (3 dot products + 3 adds per airborne step, zero per-step allocation).
3. Implemented the scoring table: AIR/BIG AIR/HUGE AIR/TO THE MOON by hang-time tier (40/120/260/450), `${n·180} SPIN` (100/180°), FRONT FLIP/BACKFLIP + doubles/triples (250 each, sign picks direction), BARREL ROLL + doubles (250 each), CLEAN/`COMBO x{n}!` (+50 flat, +25% of chain per link), WIPEOUT (0, voids combo). Sub-0.4s hang time discarded so kerb-hops stay silent. Everything gated behind `CONFIG.tricks`; exported a `trickState` debug singleton mirroring `lapState`/`ghostState`.
4. Wired `trickDetector.update()` into `useVehiclePhysics.ts` beside the ghost sample, and `cancel()` into all 3 teleport branches (restart, reset, NaN-body recovery) so an interrupted jump can't post a phantom landing.
5. Generalised `lapTracker.ts`: crossing detection and all 8 anti-cheat sector checkpoints now offset by `START = ((START_LINE_T % 1)+1)%1`, reducing exactly to the old t=0 scheme when `START_LINE_T=0`.
6. Bumped `ghost.ts`'s `TRACE_VERSION` 1→2 (so `loadGhost()` drops stale traces) and added a one-shot `migrateStaleRecords()` that clears both `localStorage` and the in-memory `bestLapMs` via `useGameStore.setState` - kept vehicle-side rather than touching the out-of-slice `core/store.ts`.
7. Wrote a throwaway headless taxonomy check (`scratchpad/trick-classify-check.ts`) exercising `classifyLanding` directly - 14/14 assertions passed (tiers, 360/540 spins, front vs back flip, doubles, barrel roll, 4-link corkscrew, sub-180 rejection).
8. Ran `bun run build` - green (`tsc -b` + vite both pass), only the pre-existing chunk-size warning.
9. Tried `ToolSearch` for a `SendMessage` tool to file the report to the team lead; none was available in this worker's environment, so the report was delivered as the final assistant message instead (twice - the lead had to prompt once for the report after an idle turn).

## Key Decisions

| Decision | Rationale |
|---|---|
| Score tricks at landing only, never mid-air | The only honest way to let a crash void the combo, since `emitTrick` banks points immediately |
| Integrate body-frame angular rate rather than quaternion delta | A trick is a winding number - a delta only yields the net 0-360°, so a 720 would read as a 0 |
| Express lap geometry relative to `START = ((START_LINE_T%1)+1)%1` | Transparent for whatever anchor value the WORLD sibling picks; reduces exactly to the old scheme at t=0 |
| Wipe stale `bestLapMs` via the store's public `setState`, not `core/store.ts` | Out of DRIVE's ownership slice; `store.ts` reads localStorage at module-init before a storage-only clear would take effect, so the in-memory clear was required too |

## Files Created

| File | Description |
|---|---|
| `src/vehicle/trickDetector.ts` | Trick detector - pure `classifyLanding` + per-step `update`/`cancel` + `trickState` debug singleton |
| `scratchpad/trick-classify-check.ts` | Ephemeral headless taxonomy check (not a deliverable) |

## Files Modified

| File | Change |
|---|---|
| `src/vehicle/useVehiclePhysics.ts` | Import + per-step `trickDetector.update()` beside the ghost sample; `cancel()` in all 3 teleport branches |
| `src/vehicle/lapTracker.ts` | Crossing + 8 sector checkpoints generalised to `START_LINE_T` offset |
| `src/vehicle/ghost.ts` | `TRACE_VERSION` 1→2 + one-shot stale-record migration (localStorage + in-memory `bestLapMs`) |

## Next Steps

- ⬜ Live in-browser trick emission unverified (left for orchestrator's integrated pass on port 5199).
- ⬜ Cross-slice flag: `getSpawn()` (WORLD-owned) needs to also move to `START_LINE_T` - if it stays at t=0 while `START_LINE_T≠0`, the first out-lap registers one harmless self-correcting spurious VOID before timing settles. (Resolved same night - WORLD's session confirms `getSpawn()` was moved.)

## Open Questions

None - no `UNCERTAIN` items raised.

## Related Sessions

- [2026-07-11 Playground phase - trick scoring, moved start line, mountain runs, crash-prop family](2026-07-11-playground-phase-tricks-scoring-crash-props.md) - orchestrator summary this worker fed into.
- [2026-07-11 WORLD worker - start line, bouncy rocks, ridge arches](2026-07-11-playground-worker-world-terrain-rocks-arches.md) - sibling worker (owns `START_LINE_T`).
- [2026-07-11 AVUI worker - audio fix + trick UI](2026-07-11-playground-worker-avui-audio-fix-trick-ui.md) - sibling worker (consumed this session's `tricks.ts` contract calls).
</content>
