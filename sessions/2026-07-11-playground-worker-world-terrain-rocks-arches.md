---
type: auto
session_id: 5a5bab02-324a-472f-ad30-23d01b16055e
project: SundownRun
date: 2026-07-11
topic: Playground-phase WORLD worker - moved start line, bouncy rocks, ridge arches + jumps
duration: 1.5 hours
events: 40
---

**Project:** SundownRun
**Purpose:** WORLD-slice worker in the 3-agent parallel playground-phase build (siblings: DRIVE on `src/vehicle/**`, AVUI on `src/ui/**`+`src/audio/**`) - move the start/finish line forward, make rocks launch the car on angled hits, and add more playground/ridge content.
**Duration:** 1.5 hours
**Participants:** Nathan, Kai
**Session Restart ID:** `claude -r 5a5bab02-324a-472f-ad30-23d01b16055e`

## Summary

Delegated worker session (team-lead orchestrated build) owning `src/world/**` + `src/core/terrain.ts`. Moved `START_LINE_T` off `t=0` to a real anchor point down the south straight, reworked bouncy-rock collision to a buried-dome shape that launches on glancing hits and still costs speed on square hits, and added five new spread jumps plus a ridge jump run and three thread-the-gate arches. `tsc -b` clean across `world/` and `core/`; the only build errors present were the AVUI sibling's `AudioEngine.ts`, correctly left untouched.

## What We Did

1. Read `CONSTITUTION.md`, `terrain.ts`, `config.ts`, `tricks.ts` and the existing `world/` files to ground in the frozen-contract slicing before editing.
2. Set `START_LINE_T = nearestRoadPoint(-30, -414).t` (≈0.07, ~270m forward of the old t=0) - a world-anchor pattern matching how crest jumps and shards resolve position, so it survives circuit re-authoring.
3. Reworked `StartLine.tsx` to rebuild its frame from `roadSpline.getPointAt/getTangentAt(START_LINE_T)` instead of the old `ROAD_DENSE[0]` shortcut that only worked at t=0.
4. Moved `getSpawn()` to `START_LINE_T` too, preserving the invariant that the car spawns on the line pointing down the straight (flagged for the DRIVE sibling's `lapTracker` generalisation).
5. Rebuilt rock colliders in `scatter.ts`/`Colliders.tsx` as buried domes (crown at the visible boulder top, centre ≥0.3m below ground) with low friction (0.12, combine Min) and high restitution (0.75, combine Max) - glancing hits ride up and launch, square hits into the exposed girth still cost forward speed. `bouncyRocks=false` restores the old grippy-ball behaviour byte-for-byte.
6. Added 5 new spread jumps (south-infield table, central double, east kicker, west table, new north pocket double) plus a new tight `'ramp'` playground kind for a chainable two-launch ridge jump run.
7. Built `RidgeArches.tsx` - 3 weathered-timber thread-the-gate gates stepping NE up the ridge, ~8m gaps, checkered banner echoing the start gantry, one merged mesh/one draw call, solid post colliders wired into `Colliders.tsx`.
8. Verified with `bun run build` and `bunx tsc -b` - confirmed zero errors in `world/`/`core/`, isolating the only failures to the AVUI sibling's file as expected under the parallel-build contract.

## Key Decisions

| Decision | Rationale |
|---|---|
| Resolve `START_LINE_T` from a world anchor `(-30,-414)` rather than a raw t-value | Survives circuit re-authoring the same way crest jumps/shards already do; lands on dead-flat asphalt so the painted band sits square |
| Rock deflection via buried-dome geometry + friction/restitution, not impulse hacks | Impulse hacks read as floaty per the brief; shaping the collision surface gives an honest, angle-dependent bounce |
| Moved `getSpawn()` to `START_LINE_T` in this same worker pass | Keeps the spawn-on-the-line invariant `lapTracker.beginLap` depends on, even though `lapTracker.ts` itself is DRIVE's file |

## Files Modified

| File | Change |
|---|---|
| `src/core/terrain.ts` | `START_LINE_T`, `getSpawn`, new `'ramp'` playground kind, 7 new `PLAYGROUNDS` entries |
| `src/world/StartLine.tsx` | Render band + gantry at `START_LINE_T` via spline lookup instead of hard-coded t=0 |
| `src/world/scatter.ts` | `RockCollider` enriched with bouncy-dome geometry fields |
| `src/world/Colliders.tsx` | Bouncy rock colliders + ridge arch post colliders + `bouncyRocks` hoisted into effect deps |
| `src/world/World.tsx` | Mount `<RidgeArches/>`, draw-call note |

### Files Created

| File | Description |
|---|---|
| `src/world/RidgeArches.tsx` | Thread-the-gate ridge component - 3 arches + post colliders, one draw call |

## Next Steps

- ⬜ In-browser feel/visual verification (launch magnitude, band placement, arch look) - left for the orchestrator's integrated browser pass.
- ⬜ Confirm DRIVE sibling's `lapTracker.ts` generalisation lands cleanly against the moved `START_LINE_T`/spawn point.

## Open Questions

None - no `UNCERTAIN` items raised.

## Related Sessions

- [2026-07-11 Playground phase - trick scoring, moved start line, mountain runs, crash-prop family](2026-07-11-playground-phase-tricks-scoring-crash-props.md) - orchestrator summary this worker fed into.
- [2026-07-11 DRIVE worker - trick detection + lap-offset](2026-07-11-playground-worker-drive-tricks-lap-offset.md) - sibling worker (consumed `START_LINE_T`).
- [2026-07-11 AVUI worker - audio fix + trick UI](2026-07-11-playground-worker-avui-audio-fix-trick-ui.md) - sibling worker.
</content>
