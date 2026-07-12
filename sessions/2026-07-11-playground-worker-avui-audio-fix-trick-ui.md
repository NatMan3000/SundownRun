---
type: auto
session_id: 3c1ef58e-0e1c-4e39-a137-625ac939546c
project: SundownRun
date: 2026-07-11
topic: Playground-phase AVUI worker - controller-restart audio fix, trick scoring UI, airborne rev-up, wind removal
duration: 1.5 hours
events: 56
---

**Project:** SundownRun
**Purpose:** AVUI-slice worker in the 3-agent parallel playground-phase build (siblings: WORLD on `src/world/**`+terrain, DRIVE on `src/vehicle/**`) - fix the gamepad-restart silent-audio bug, build the trick scoring UI against DRIVE's `tricks.ts` contract, then (mid-session, added by Nathan) fix airborne engine pitch and remove the wind whistle.
**Duration:** 1.5 hours
**Participants:** Nathan, Kai
**Session Restart ID:** `claude -r 3c1ef58e-0e1c-4e39-a137-625ac939546c`

## Summary

Delegated worker session owning `src/audio/**` + `src/ui/**`. Traced the controller-restart audio bug to its real root cause (gamepad buttons never fire a DOM gesture and `IntroCard`'s pad-dismiss path deliberately skips `ensureStarted()` - not the team lead's `dispose()` hypothesis) and fixed it by polling the gamepad for sticky browser activation. Built `TrickHud.tsx` against DRIVE's frozen `tricks.ts` contract before DRIVE's detector had even landed, then verified the poll shape matched once it did. Mid-session Nathan added two more audio asks - airborne free-rev engine pitch and removing the wind whistle - both delivered in the same session. `bun run build` green throughout.

## What We Did

1. Read `CONSTITUTION.md`, `core/tricks.ts`, `AudioEngine.ts`, `HUD.tsx`, then traced every caller of `installGestureUnlock`/`ensureStarted`/`dispose`/`setHidden` across the app (`App.tsx`, `AudioSystem.tsx`, `IntroCard.tsx`, `input.ts`) to find the real audio-lifecycle path, plus fetched MDN/Chrome docs on `UserActivation` and autoplay policy to confirm the gamepad-activation constraint.
2. **Root-caused the controller-restart bug**, disproving the team lead's `dispose()` hypothesis: `dispose()` only runs on `AudioSystem` unmount, which an in-place restart never triggers. The real cause is that a gamepad button raises no DOM event and isn't a browser user gesture, and `IntroCard`'s pad-dismiss path deliberately skips `ensureStarted()` - so a pad-only player never gets audio *built* in the first place, not torn down.
3. Fixed it: `installGestureUnlock()` now also polls the gamepad (120ms); once the document holds sticky activation (`navigator.userActivation.hasBeenActive`, set by any prior real gesture), a pad button calls `ensureStarted()` and tears the poll down, one-shot like the DOM path. `ensureStarted()` only builds a fresh context when none exists, otherwise resumes the same one - so a restart never rebuilds the context. Flagged the one unfixable residual: a truly fresh document with zero prior gestures still needs one keyboard/mouse/touch input first (Chromium autoplay policy) - hardware-only to verify.
4. Built `TrickHud.tsx` against DRIVE's frozen `tricks.ts` contract (polling `tricksState` once per rAF exactly like `HUD.tsx` polls telemetry) before DRIVE's detector had landed in the working tree - punchy gold trick popups with an amber `×N` combo pill, a persistent SCORE/BEST COMBO scoreboard in the lap panel's golden-hour styling, and a procedural ascending-pentatonic audio cue on big tricks (≥120pts) through the existing `bell`/`tone` voices.
5. Mid-session, Nathan added two more audio tasks via the team lead: (a) airborne engine pitch was falling because it was derived from `telemetry.rpm` (tracks ground speed) - fixed by free-revving the engine's own level while airborne and throttle held, chasing a limiter, reprimed from `rpmN` on every grounded frame; (b) removed the wind whistle entirely (`windBp`/`windGain`) per Nathan's stated default of removal-over-silencing, noting road rumble + engine pitch + camera FX still carry speed-feel.
6. Once DRIVE's `trickDetector.ts` landed in the tree, verified its `emitTrick(label, points, comboCount)` + `commitCombo(total)` calls matched the UI's expectations exactly; added one polish detail - rendering `WIPEOUT` (0 points) muted rather than celebratory gold.
7. Hardened a dispose/rebuild edge case: `lastUpdateT` persisted module-level, so a `dispose()` + rebuild could hand the free-rev integrator a negative `dt` for one frame - reset the free-rev state on dispose.
8. Ran `bun run build` repeatedly through the session - green throughout, only the pre-existing chunk-size warning.
9. `ToolSearch` returned no `SendMessage` tool in this worker's environment (confirmed twice, including a probe for any messaging CLI); filed the full report as the final assistant message both times the team lead prompted for it.

## Key Decisions

| Decision | Rationale |
|---|---|
| Disproved the `dispose()` hypothesis and fixed the real gesture-unlock gap instead | Tracing every caller showed `dispose()` never fires on restart; the actual gap was gamepad input never counting as a browser gesture |
| Poll gamepad state for sticky `userActivation` rather than trying to force-start audio on a pad press | Respects the browser autoplay policy - only works after any real gesture has ever landed, which is the correct, honest boundary |
| Built `TrickHud.tsx` against the frozen contract before DRIVE's detector shipped | The `tricks.ts` shape was frozen (committed at `5fd937d`), so building against it in parallel unblocked both workers |
| Wind whistle removed outright, not silenced at low volume | Matches Nathan's stated default; road rumble + engine pitch + camera FX already carry speed-feel |

## Files Created

| File | Description |
|---|---|
| `src/ui/TrickHud.tsx` | Trick popups + persistent scoreboard, polling `tricksState` off `core/tricks.ts` |

## Files Modified

| File | Change |
|---|---|
| `src/audio/AudioEngine.ts` | Gamepad-aware gesture unlock, `hasBeenActivated()` helper, `playTrick()` cue, airborne free-rev engine model, wind whistle (`windBp`/`windGain`) fully removed, dispose-safe free-rev reset |
| `src/ui/HUD.tsx` | Mount `<TrickHud />` inside `.hud-root` |
| `src/ui/hudStyles.ts` | Trick popup + scoreboard styles, intro-hide rule extended, muted `WIPEOUT` styling |

## Next Steps

- ⬜ Physical-gamepad verification (hand to Nathan): pad-only restart keeps sound with no keyboard input; a truly fresh load before any gesture shows no "AudioContext was not allowed to start" console warning.
- ⬜ Airborne rev-up and wind-removal are audible checks best confirmed live during the integrated browser pass.
- ⬜ Live in-browser trick UI verification (left for orchestrator's integrated pass on port 5199).

## Open Questions

None - no `UNCERTAIN` items raised.

## Related Sessions

- [2026-07-11 Playground phase - trick scoring, moved start line, mountain runs, crash-prop family](2026-07-11-playground-phase-tricks-scoring-crash-props.md) - orchestrator summary this worker fed into (the "controller-restart audio fix" line references this fix).
- [2026-07-11 WORLD worker - start line, bouncy rocks, ridge arches](2026-07-11-playground-worker-world-terrain-rocks-arches.md) - sibling worker.
- [2026-07-11 DRIVE worker - trick detection + lap-offset](2026-07-11-playground-worker-drive-tricks-lap-offset.md) - sibling worker (owns the `tricks.ts` contract this UI consumed).
</content>
