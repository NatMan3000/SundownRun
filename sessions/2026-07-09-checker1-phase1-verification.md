---
type: auto
session_id: ae49eadc-0b69-478e-a050-bd04fbb65de1
project: CarDriveGame3d
date: 2026-07-09
topic: Checker-1 independent phase-1 verification - found the divergent handbrake-spin blocker
duration: 5.4 hours
events: 105
---

**Session Restart ID:** `claude -r ae49eadc-0b69-478e-a050-bd04fbb65de1`

**Duration:** 5.4 hours
**Participants:** Nathan, Kai

## Summary

Independent-checker session on the Sundown Run build (phase 1: world + vehicle). Re-executed every claim against the production preview (`:5299`, isolated from the live `:5199` dev server other workers were editing) rather than trusting worker reports, per the constitution's re-execute protocol. Found one blocker - a passively divergent handbrake drift that spins the car to facing backwards with zero player input - plus several lower-severity defects, and killed two false alarms before filing.

## What We Did

1. Read `CONSTITUTION.md`, batch-loaded chrome-devtools MCP tools, opened an isolated tab on `:5299` (retitled `checker-1 · phase1`), and confirmed the static preview build was serving the correct phase-1 code (bundle predated the look worker's post-stack commits by 24 minutes, so lighting/post defects were correctly attributed to phase 2, not phase 1).
2. Ran the demo-lap perf harness twice (cold + warm), then independently re-instrumented performance with a second rAF probe to validate the harness's own `avgMs`/`p99Ms` numbers rather than taking them on trust - both instruments agreed (avg 1.27-1.56ms JS, 60fps, zero dropped frames across both runs).
3. Verified determinism via bit-identical terrain hash and draw-call/triangle counts across two hard reloads, and self-containment via `performance.getEntriesByType('resource')` (2 resources, both localhost).
4. Ran a full synthetic-input drive battery: acceleration/gear shifts, top-speed cap, braking, both-direction steering with attack/release smoothing verified against tuning constants to three decimal places, the crest jump (measured 1467ms of air), reset-to-road, and camera behaviour during a spin.
5. Found and reproduced the session's central defect: after a brief handbrake tap with all inputs then released, the drift angle grows monotonically from -36° to -179° with zero player input - the car spins itself to facing backwards. Traced the mechanism to `useVehiclePhysics.ts` - yaw damping cuts to 31% exactly while the car is rotating fastest, with no restoring torque toward the velocity vector, and tyre lateral grip falls off past the slide-angle peak, creating positive feedback.
6. Independently proved the world's road-loop circuit closes: drove the demo autopilot a full lap and confirmed the car returned within 1.5m of the start after 3836.8m travelled, 0% off-road.
7. Wrote the full verdict (table + defect list + ruling) to `scratchpad/checks/checker1-verdict.md` on request from the team lead after an initial idle-without-report notification.

## Key Decisions

| Decision | Rationale |
|---|---|
| Ruled phase 1 not true-done, one blocker (D1) | Constitution names a "catchable" drift as the standard; a hands-off spin to facing backwards fails that unconditionally for the target 12-year-old player |
| Deferred D3 (no shadows) and D4 (perf re-adjudication) to the look worker / a future checker | The tested build was confirmed pre-dating the post-processing/lighting commits - correctly out of phase-1 scope |
| Filed D5 (telemetry.slip conflates wheelspin with lateral slide) as a "should fix" nit, not a blocker | Doesn't break gameplay, but the AV-UI worker was actively consuming that field for audio/HUD in a concurrent session |

## Files Created

| File | Description |
|---|---|
| `scratchpad/checks/checker1-verdict.md` | Full phase-1 verdict: PASS/FAIL/UNVERIFIABLE table, 5-item defect list, overall ruling |
| `Build Screenshots/03-check1-boot.jpeg`, `03-check1-air.jpeg`, `03-check1-drift.jpeg`, `03-check1-fov-still.jpeg`, `03-check1-fov-fast.jpeg` | Evidence screenshots for the verdict |

## Next Steps

- ⬜ (owned by drive worker, since actioned per checker-2's session) fix the divergent handbrake-spin blocker (D1)
- ⬜ (since actioned) expose lap state on `window.__game` so lap timing is independently verifiable (D2)
- ⬜ (since actioned) fix `telemetry.slip` conflating wheelspin with lateral slide (D5)
- ⬜ (owned by look worker, in flight concurrently) add `shadow-mapSize` + a tight shadow-camera frustum that follows the car (D3)

## Related Sessions

- [Sundown Run built end-to-end and shipped DONE](2026-07-09-sundown-run-full-build.md) - orchestrator session for this whole build
- [AV-UI worker](2026-07-09-avui-worker-audio-hud-delights.md)
- [World worker](2026-07-09-world-worker-terrain-physics.md)
- [Vehicle worker](2026-07-09-vehicle-worker-physics-tuning.md)
- [FX/postprocessing worker](2026-07-09-fx-postprocessing-worker.md)
- [Checker-2 final verification](2026-07-09-checker2-final-verification.md)
