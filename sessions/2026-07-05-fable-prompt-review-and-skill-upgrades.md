---
type: auto
session_id: f3d3e0c2-140b-4eea-a5aa-1e2820439488
project: CarDriveGame3d
date: 2026-07-05
topic: Fable driving-game prompt review + FablePrompt/PlanF3 skill upgrades
duration: 33 minutes
events: 62
---

**Duration:** 33 minutes
**Participants:** Nathan, Kai
**Session Restart ID:** `claude -r f3d3e0c2-140b-4eea-a5aa-1e2820439488`

## Summary

CarDriveGame3d has no code yet - Nathan explicitly deferred building until he has more context available (this session pre-dates project scaffolding: no git repo, no CLAUDE.md). The session's actual work was reviewing and upgrading an Opus-drafted Fable prompt for the eventual build (a 3D driving game to build together with his 12-year-old son Josh), then generalising what was learned into the `/FablePrompt` and `/PlanF3` skills and the `fable-operating-guide.md` SSOT.

## What We Did

1. Reviewed `scratchpad/fable-prompts/polished-3d-driving-game.md` (an Opus-authored draft) against the Fable operating guide and identified four gaps: missing general anti-fabrication grounding block, no named verification-tooling surface, no tiebreak for colliding done-criteria (60fps vs visual quality), no git-checkpoint instruction for a long autonomous run.
2. Upgraded the prompt with all four fixes, plus a full reframe of the "why" around Josh (the stakes: inspiring a 12-year-old toward building things), a kid-delight done-criterion, and a "fun knobs" config file as a deliberate onramp to his first codebase. Swept Opus's em-dashes.
3. Added Bluetooth Xbox controller / Gamepad API support on request, with an explicit "flag for human test" out since a physical controller can't be harness-verified - avoiding a collision with the anti-fabrication block.
4. Strengthened the graphics/quality bar per Nathan's request: named an explicit reference class (award-site three.js/r3f showcase tier, not hobby demos), gave permission to go deep (hand-written GLSL on the table), held motion to the same bar as stills (springs/damping, fixed-timestep physics), and added a convergence line ("if a screenshot wouldn't make someone stop scrolling, keep iterating").
5. Generalised the session's craft levers into `~/.claude/skills/FablePrompt/SKILL.md`: why/who as the strongest lever, reference-class anchoring over adjectives, criteria-conflict tiebreaks, permission-to-go-deep, a verification-feasibility walk (tool surface, dev-only affordances, human-test-out for unverifiables), git checkpoints for long runs, and a pre-flight checklist.
6. Queried atoms for prior Fable-behaviour lessons, then made five tweaks to `~/.claude/memory/fable-operating-guide.md`: modernised routing pattern (opus-medium worker directive), concrete API call shape (`thinking: {type:"adaptive"}` + `output_config.effort`, never `budget_tokens`), a companion rule for unverifiable criteria, and refreshed source/access caveats.
7. Reviewed and upgraded `/PlanF3` (`SKILL.md` + `workflows/create-plan.md` + `workflows/build-plan.md`): fixed a self-contradiction (stale "Fable access not yet restored" line vs its own Gotchas saying it was), swept em-dashes leaking out of the HTML template into every generated plan, added a missing "Questionables" nav link a stale comment referenced, and baked the same verification-feasibility/tiebreak loop into the create/build workflow pair so human-verify items are never self-flipped to `[x]`.
8. Committed and pushed both skill/guide changes to the Kai repo (`e2d0176` FablePrompt, `3a6df8a` PlanF3); the `fable-operating-guide.md` edit could not be committed - it lives under the gitignored `projects/` memory-symlink tree (known, accepted trade-off, Time Machine covers it).

## Key Decisions

| Decision | Rationale |
|---|---|
| Do not commence the game build this session | Nathan wants to build it later with Josh present, once he has more context available - this session was prompt-craft only |
| Reference class > adjectives for quality bar | "Really high quality" moves nothing; naming a comparison population ("award-site three.js showcases") calibrates the model's own "done" bar |
| Gamepad support flagged as human-verify | Fable cannot harness-verify a physical Bluetooth controller; pairing that criterion with the anti-fabrication block without an explicit out would force hedging or a silently untested claim |
| Keep Fable *rules* in the operating guide, prompt *craft* in the skill | Preserves the SSOT split the guide already declares - model-behaviour facts vs reusable prompt-engineering levers |

## Files Modified

| File | Change |
|---|---|
| `scratchpad/fable-prompts/polished-3d-driving-game.md` | Fully upgraded build prompt (anti-fabrication, verification tooling, tiebreak, git checkpoints, Josh reframe, kid-delight criterion, fun-knobs config, gamepad support, reference-class quality bar) |
| `~/.claude/skills/FablePrompt/SKILL.md` | 6 new prompt-craft levers + pre-flight checklist (committed to Kai repo, `e2d0176`) |
| `~/.claude/memory/fable-operating-guide.md` | 5 tweaks - routing modernised, API call shape, unverifiable-criterion rule, refreshed caveats (not git-tracked - see gotcha below) |
| `~/.claude/skills/PlanF3/SKILL.md`, `workflows/create-plan.md`, `workflows/build-plan.md` | Self-contradiction fix, em-dash template sweep, nav-link fix, verification-feasibility loop (committed to Kai repo, `3a6df8a`) |

## Next Steps

- ⬜ Start a fresh Fable session in this directory at `xhigh` effort with Josh in the chair, paste the finished prompt, and build.
- ⬜ Plan a "v2 with Josh" follow-up session once the game exists (his first feature request).
- ⬜ Project has no scaffold yet (no CLAUDE.md/open-threads/TIMELINE/git repo) - scaffold when the build actually starts, not before.

## Open Questions

- None open from this session - all four craft edits landed, plus the extras Nathan requested (gamepad, graphics bar).

## Note on git

This project has no git repository yet - only a `scratchpad/` directory exists. No commit was made here; the durable output of this session (skill + guide upgrades) is already committed in the Kai repo. This session log itself is not git-tracked as a result.
