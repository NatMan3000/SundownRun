---
type: auto
session_id: df2e620e-de1e-4981-97d2-4676d8438fc7
project: SundownRun
date: 2026-07-11
topic: Rim-run gates + big-air terrain probing
duration: 31 minutes
events: 61
---

# Rim-run gates + big-air terrain probing

**Session Restart ID:** `claude -r df2e620e-de1e-4981-97d2-4676d8438fc7`

**Duration:** 31 minutes

**Participants:** Nathan, Kai

## Summary

An autonomous worker session (no live user prompts - a delegated build slice) that added a rim-run gate system for the crater rim big-air terrain. Work was probe-driven: several throwaway `scratchpad/*.ts` scripts sampled `terrain.ts` height/slope functions along the rim and radial profiles to find real launch/landing geometry before writing any gameplay code, then verified the chosen runs against the actual terrain sampler before committing to the World scene.

## What We Did

1. Wrote `scratchpad/probe-rim.ts` and `scratchpad/probe-radial.ts`/`probe-radial2.ts` to sample `getBaseHeight`/`rimHeightAt`/`roadDistance` around the crater rim and find launch-worthy slope transitions
2. Wrote `scratchpad/verify-runs.ts` and `scratchpad/verify-kickers.ts` to compute real ground slope at candidate points and confirm they'd actually launch a car, iterating on the profile more than once
3. Added `getAirRuns` export to `src/core/terrain.ts` so gameplay code can query the same geometry the probes verified
4. Created `src/world/rimRunGates.ts` (new) - the gate/marker data for the rim-run big-air feature
5. Created `src/world/RimRuns.tsx` (new) - the React Three Fiber component rendering the gates in the scene
6. Wired the new runs into `src/world/Colliders.tsx`, `src/world/World.tsx`, and `src/world/scatter.ts`
7. Ran `bun run build` twice to confirm a clean typecheck/build after the terrain export change

## Key Decisions

| Decision | Rationale |
|---|---|
| Probe terrain functions with disposable scratchpad scripts before writing gameplay code | The rim geometry is procedural (not authored) - guessing launch angles from `config.ts` values alone risked runs that don't actually connect to real slope transitions |
| Export `getAirRuns` from `terrain.ts` rather than duplicating slope math in `rimRunGates.ts` | Keeps a single source of truth for terrain queries per the frozen-core-contract convention (`core/` owns terrain API) |

## Files Created

| File | Description |
|------|-------------|
| `src/world/rimRunGates.ts` | Gate/marker data for the crater-rim big-air run |
| `src/world/RimRuns.tsx` | R3F component rendering the rim-run gates |

## Files Modified

| File | Description |
|------|-------------|
| `src/core/terrain.ts` | Added `getAirRuns` export |
| `src/world/Colliders.tsx` | Wired rim-run colliders |
| `src/world/World.tsx` | Mounted `RimRuns` |
| `src/world/scatter.ts` | Adjusted scatter to account for the new rim-run zone |

## Next Steps

- Live playtest the rim-run gates (this session was headless/probe-driven, no in-browser verification)
- Confirm gate placement doesn't overlap existing playground content from the same day's larger playtest session

## Related Sessions

- [2026-07-11 Playground phase - trick scoring, moved start line, mountain runs, crash-prop family](2026-07-11-playground-phase-tricks-scoring-crash-props.md)
