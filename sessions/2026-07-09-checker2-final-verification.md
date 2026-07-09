---
type: auto
session_id: faec0929-3f6f-4b95-9088-d1e6a554bbdc
project: CarDriveGame3d
date: 2026-07-09
topic: Checker-2 final verification - GPU-timer perf sign-off, section-5 hard rules, unconditional DONE
duration: 1.5 hours
events: 226
---

**Session Restart ID:** `claude -r faec0929-3f6f-4b95-9088-d1e6a554bbdc`

**Duration:** 1.5 hours
**Participants:** Nathan, Kai

## Summary

Final-round independent checker session on Sundown Run, verifying the full-look build (post stack, shadows, audio, all colliders) against `CONSTITUTION.md` after checker-1's D1 blocker and subsequent fixes. Closed every open item from round 1, signed off the constitution's section-2 perf budget with a real GPU timer (closing checker-1's stated blind spot), verified both new section-5 hard rules (world containment and consistent/smashable trees), ran the clean-clone gate, and - after mid-session Chrome crash and a Nathan-flagged mountain-fog defect - confirmed a same-day fix and issued the final unconditional DONE ruling.

## What We Did

1. Read `CONSTITUTION.md` and checker-1's verdict for calibration, confirmed the `:5299` static preview was serving current HEAD with the full post stack and `treeSmashKmh` present in the bundle (closing checker-1's D4 blind spot about testing a stale build).
2. Cycled all four garage car bodies and inspected cropped roof screenshots at 1:1 for z-fighting moire - none found.
3. Signed off the section-2 perf budget using a real GPU timer (`EXT_disjoint_timer_query_webgl2`, straddling a TIME_ELAPSED query around one frame's GL commands) rather than main-thread-only JS timing: measured avg 2.0ms / p99 4.4ms GPU time alongside 1.1-1.25ms JS, 60fps held over two 1800-frame runs, 73 draw calls, 1.05M triangles - all inside budget with the full look stack.
4. Re-verified checker-1's D1 blocker and confirmed it fixed: a hands-off handbrake tap now peaks at 18.9° and self-straightens to 2.4° by 2.6s (vs the prior build's monotonic divergence to 179°), while a held drift stays alive under sustained input - a proper catchable arcade drift.
5. Ran the full drive battery: understeer check (a controlled skidpad sustaining 1.58g lateral at 63-72m radius, genuinely carving rather than plowing), R reset, Shift+R restart (teleport accuracy <0.02m from true spawn, lap void semantics correctly gated on lap-armed state), three-way camera cycle (no snap >1.5m/frame), and Escape-to-title with confirmed localStorage persistence of car body and steering setting.
6. Verified both new section-5 hard rules: trees hold solid at low speed (<40km/h, car nearly stopped) and smash away at high speed (>50km/h, 98% speed retained) at the same location; world-boundary containment held on three different high-speed bearings including a 174km/h rim ram, with the mountain slope acting as a natural barrier and no fall-through.
7. Ran the anti-cheat trio: a 40s circling-the-start-line probe never incremented lapCount; a full clean demo lap set `bestLapMs`; a demo run with a deliberate course cut registered `lastLapDirty: true` without setting `bestLapMs`.
8. Ran the clean-clone gate (`git clone` to `/tmp`, `bun install && bun run build`, serve on `:5499`, drive 3s) - passed, proving a stranger's machine gets a working game from the repo alone; cleaned up the clone dir and freed the port afterward.
9. Mid-session Chrome crash disconnected the DevTools MCP bridge; wrote an honestly-labelled interim verdict noting exactly which of the ~9 checks remained browser-blocked, then resumed and closed all of them once Chrome was manually reconnected.
10. Investigated and confirmed a Nathan-flagged defect (distant-mountain fog reveal reading as flat cutout bands, not warm atmospheric haze) via code read (`Mountains.tsx` - camera-locked `fog:false` alpha mesh, baked static haze sharing no atmosphere with the fogged foothills) plus before/after screenshot A/B; after the look/world worker landed a same-day fix (`995206c`), re-verified the two diagnostic angles and confirmed the ridges now dissolve into shared warm `#CDA184` haze with no new hard edge - flipped the verdict to unconditionally DONE.

## Key Decisions

| Decision | Rationale |
|---|---|
| Used a real GPU timer instead of JS-only timing for the section-2 sign-off | Checker-1 explicitly flagged that main-thread `avgMs` can't see GPU headroom loss; this build (full post stack + shadows) was the one that needed the real number |
| Wrote an interim, honestly-labelled partial verdict when Chrome crashed mid-sweep | Team lead directive: a partial verdict labelled exactly which checks ran vs didn't beats silence or an unlabelled guess |
| Treated D-FOG as non-blocking but worth escalating immediately | Not a hard-rule failure (top-edge-to-sky handled cleanly) but the highest-value remaining polish item; flagged to Nathan directly mid-session rather than held for the final report |
| Final ruling: Sundown Run is DONE, unconditionally | Every constitution clause checked passed on this session's own tool-result evidence, including the two new section-5 hard rules and the perf budget under the full look stack; D-FOG was confirmed fixed and re-verified before the ruling was issued |

## Files Created

| File | Description |
|---|---|
| `scratchpad/checks/checker2-verdict.md` | Full final-round verdict: table, defect list (including D-FOG), overall DONE ruling |
| `scratchpad/checks/c2-*.png` | ~20 evidence screenshots (garage bodies/roofs, drift+smoke, spawn/tree-aim frames, fog before/after A/B crops) |

## Next Steps

- None outstanding - session ended with an unconditional DONE ruling and board closed by the team lead.

## Open Questions

- None - all items the session opened (D-FOG) were closed within the same session.

## Related Sessions

- [Sundown Run built end-to-end and shipped DONE](2026-07-09-sundown-run-full-build.md) - orchestrator session for this whole build
- [AV-UI worker](2026-07-09-avui-worker-audio-hud-delights.md)
- [World worker](2026-07-09-world-worker-terrain-physics.md)
- [Vehicle worker](2026-07-09-vehicle-worker-physics-tuning.md)
- [FX/postprocessing worker](2026-07-09-fx-postprocessing-worker.md)
- [Checker-1 phase-1 verification](2026-07-09-checker1-phase1-verification.md)

## Gotcha (worth carrying forward)

Running many WebGL game preview tabs concurrently while chrome-devtools MCP hammers `take_screenshot`/`evaluate_script` can OOM/crash Chrome mid-session (observed here). Recovery: the DevTools MCP bridge goes down with it and needs a manual `/mcp` reconnect - ToolSearch alone won't bring it back. When it happens mid-sweep, write an interim verdict immediately labelling exactly which checks completed before continuing, rather than losing the work.
