# Session Log: 2026-07-09 - Sundown Run Full Build

**Project:** CarDriveGame3d ("Sundown Run")
**Purpose:** Orchestrated multi-agent build of a complete golden-hour 3D driving game from a blank repo to unconditional sign-off
**Duration:** Full session (single sitting)
**Participants:** Nathan, Kai (orchestrator/art director), 4 long-lived Opus workers (world, drive, look, avui), 2 independent checker agents
**Session Restart ID:** `claude -r a33df89b-c2e6-47e9-945b-87bfea71e2c5`

---

## Summary

Built "Sundown Run" - a golden-hour open-world 3D driving game for Josh - entirely from scratch in one session, driven by a written `CONSTITUTION.md` standard. Kai orchestrated 4 long-lived Opus worker agents (world/drive/look/avui) plus 2 independent fresh-context checker agents via Agent teammates, tracked throughout on the Nexus cluster kanban (project 45, "Car Game"). Ended with an unconditional DONE ruling and all agents shut down.

---

## What We Did

1. Wrote `CONSTITUTION.md` (art direction, 60fps performance budget, gameplay feel rules) and froze core contracts (config/telemetry/store/terrain API) so multiple agents could edit the same repo concurrently without merge conflicts.
2. Landed Phase 1 in parallel: **world** (3.87km circuit with jumps and a hairpin) + **drive** (raycast vehicle physics).
3. Ran checker-1 - found a first-minute divergent-drift blocker. Fixed with per-axle slide plateaus and intent-gated restoring torque.
4. Landed Phase 2 in parallel: golden-hour look + post-processing stack, procedural audio, HUD, 10 sun shards (**look** + **avui**).
5. Worked through a long series of Nathan's live play-test reports, each routed to the owning worker:
   - World boundary sealed (energy-argument rim + failsafe ring + catch floor for rapier heightfield tunnelling)
   - 1342 smashable tree-trunk colliders (disarm-before-step above a configurable smash speed)
   - Checkered start line
   - Lap validity anti-cheat: 8 ordered sector checkpoints + a dirty-lap rule
   - Steering rebuilt three times (constant-g rack -> understeer fix -> `latLimitG 1.8`)
   - Title-screen garage: 4 Rocket-League-inspired car bodies + steering sensitivity slider, persisted to `localStorage`
   - Camera cycle (C / RB: chase / close / bonnet)
   - Three reset tiers (R / Shift+R / Esc)
   - Roof z-fighting fix (18mm glass-volume drop below the roofline)
   - Mountain slab reworked into alpha-dissolve + a "D-FOG" warm-haze atmospheric bridge
6. Ran checker-2 - signed off Section-2 performance with real GPU frame timers (2.0ms / 4.4ms, steady 60fps) and a clean-clone build gate.
7. Chrome crashed mid-check (too many concurrent game tabs + CDP traffic) - recovered, no data lost.
8. Final ruling: **unconditionally DONE** against `CONSTITUTION.md`. All 6 agents shut down.
9. Scaffolded the standard project files (`CLAUDE.md`, `TIMELINE.md`, `open-threads.md`) - this project graduated from a build sandbox to a real tracked project.

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Frozen core contracts (config/telemetry/store/terrain API) + strict file ownership per worker | Let 2-4 Opus agents edit the same repo concurrently across ~10 rounds with zero merge conflicts |
| Fresh-context checker agents re-execute the game rather than reading worker self-reports | Checker-1 caught a first-minute drift blocker the worker's own traces had looked past - independent re-execution beats self-report |
| Lap anti-cheat = 8 ordered sector checkpoints + dirty-lap rule (>3s cumulative off-road forfeits best-lap eligibility) | Racing-convention, kid-legible, keeps off-road driving legal without letting it set records |
| Catch-floor slab + below-terrain auto-reset for rapier heightfield tunnelling | Rapier's heightfield collider is infinitely thin and doesn't arm CCD on it - needed a hard backstop, not just a physics tune |
| Mountains fade via vertex-alpha dissolve instead of fog-to-solid-colour | Fogging to a flat colour produced a visible slab with a hard edge against the gradient sky; dissolving into the sky reads as real atmosphere |
| No git remote configured yet | Nathan's call - repo stays local-only on `main` until he's ready to push |

---

## Files Created

| File | Purpose |
|------|---------|
| `CONSTITUTION.md` | Binding art-direction + performance + feel standard |
| `src/core/config.ts` | Josh's kid-facing tunable-knob file |
| `src/core/`, `src/vehicle/`, `src/world/`, `src/fx/`, `src/audio/`, `src/ui/`, `src/dev/` | Full game source tree (world, physics, look, audio/UI) |
| `README.md` | Player-facing instructions (controls, run steps, Josh's config pointer) |
| `CLAUDE.md`, `TIMELINE.md`, `open-threads.md` | Standard project tracking files (this session) |
| `scratchpad/checks/checker1-verdict.md`, `checker2-verdict.md` + supporting screenshots/harnesses | Checker verdicts and working evidence (gitignored) |

## Files Modified

24+ commits across the session - world/drive/look/avui source trees, steering rebuilt three times, boundary/collision fixes, lap-validity engine, garage/title screen, camera system, z-fighting fix, fog bridge. Full history: `git log --oneline` on `main`.

---

## Next Steps

- [ ] Configure a Forgejo remote and push (see `open-threads.md`)
- [ ] Consider ghost-lap racing feature (race your own best lap)
- [ ] Consider tree regrowth on reset (currently trees stay smashed for the session)
- [ ] Consider a parallax distant-mountain layer

---

## Open Questions

None outstanding - checker-2's ruling was unconditional.

---

## Git Status

Working tree clean at session start of this EndSession pass (all game code already committed across the build session, 24+ commits, `main`, no remote). This EndSession pass adds `CLAUDE.md`, `TIMELINE.md`, `open-threads.md`, and this session log.

---

## Atom Candidates (for tonight's extraction)

- GOTCHA: A rapier heightfield collider is infinitely thin - a body descending faster than ~28m/s in one 60Hz step can tunnel straight through, and rapier CCD does not arm on it; the fix is a catch-floor slab plus a below-terrain auto-reset.
- GOTCHA: THREE `BufferGeometryUtils.mergeGeometries` returns `null` when given mixed indexed and non-indexed geometries (`ExtrudeGeometry` is non-indexed, `CylinderGeometry`/`BoxGeometry` are indexed) - a non-null assertion on its result turns a loud failure into a silent black canvas with per-frame `boundingSphere` crashes.
- GOTCHA: Fogging distant mountains toward a solid colour can never match a gradient sky - the silhouette becomes an opaque slab with a hard top edge; dissolve far scenery by vertex alpha to zero at summits (`fog: false`) so the sky shows through, and bake the fog colour into low-altitude vertex colours to share atmosphere with fogged mid-ground.
- GOTCHA: Two coplanar authored faces (glass top copied from roof points) z-fight as whole-face moire; fix by geometric separation (18mm drop), never `polygonOffset`.
- PATTERN: In an orchestrated multi-agent game build, giving each worker strict file ownership + frozen core contracts (config/telemetry/store/terrain API) lets 2-4 Opus agents edit the same repo concurrently with zero merge conflicts across ~10 rounds.
- PATTERN: Fresh-context checker agents that re-execute (drive the game via synthetic input, measure real GPU frame time via `EXT_disjoint_timer`, clean-clone the repo) catch what worker self-reports miss - checker-1 found a first-minute drift blocker the worker's own traces looked past; require every claim to point at a tool result from the checker's own session.
- GOTCHA: Running 5+ WebGL/rapier game tabs while a checker hammers CDP screenshots can OOM Chrome and kill the DevTools MCP bridge mid-run - enforce agent browser-tab teardown on idle and keep one game instance per concurrent checker.
- DECISION: Lap-time anti-cheat = 8 invisible ordered sector checkpoints (kills tiny-circle laps) + a dirty-lap rule (>3s cumulative off-road shows time but never sets best) - racing-convention, kid-legible, keeps off-road play legal.
- PROCESS: Nathan play-tested continuously during the orchestrated build and his defect reports (boundary escape, ghost trees, balloon car, steering feel x3, z-fight roofs, fog slab) drove more quality than any pre-planned spec - route player reports straight to the owning worker with constitution amendments where the standard was missing.
