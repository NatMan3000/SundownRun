---
type: auto
session_id: 9daf5090-0226-4c09-9b25-0e55c85b00ad
project: SundownRun
date: 2026-10-01
topic: Sundown Run Two brainstorm + one-shot build prompt
duration: 1.7 hours
events: 144
events_unit: turns
---

# Sundown Run Two brainstorm + one-shot build prompt

**Project:** SundownRun
**Purpose:** Design a fresh one-shot prompt for a from-scratch rebuild (Sundown Run Two, `~/Dev/SundownRun2`) on Opus 5.5
**Duration:** 1.7 hours
**Participants:** Nathan, Josh, Kai
**Session Restart ID:** `claude -r 9daf5090-0226-4c09-9b25-0e55c85b00ad`

## Summary

Nathan and Josh want a clean rerun of the game build to see what current models produce. Kai harvested the old Fable prompt, all ten session logs, the constitution and the code, ran a two-round decision brainstorm (D1-D15, read aloud via `/say`), and wrote a paste-ready Opus 5.5 `xhigh` one-shot prompt that bakes in everything v1 only reached through later sessions.

## What We Did

1. Harvested v1: what the game grew into after the original prompt (tricks, crash props, ghost lap, garage, LAN multiplayer, banked corners, shard hunt, Windows launchers, world map, Learn To Code), what flopped (volcano theme, gates, radio voices, wind whistle), feel fixes and physics-engine traps, and Josh's Windows laptop issues (integrated GPU, PowerShell policy, firewall).
2. Wrote `research/sundown-run-2-brainstorm.md` with the harvest and a decision log.
3. Round 1 (D1-D8) and round 2 (D9-D14) decided with Nathan and Josh: futuristic neon synthwave theme, two launch tracks (fun track + adjustable-bank oval) on tracks-as-data foundations, top-down road drawing editor, LAN multiplayer reused from v1, radio DJ on hold, in-game settings menu, Ai racers selectable 0-5, wheels not hover, procedural synthwave music, one JSON file per track.
4. Wrote `research/sundown-run-2-build-prompt.md`, the one-shot prompt for a new session in `~/Dev/SundownRun2`.
5. D15: confirmed the prompt already has the build write its own constitution first; Nathan chose no sign-off pause.
6. Indexed both files in FILE-INDEX.md; committed and pushed in-session (`274c3d5`, `d6d0399`).

## Key Decisions

| Decision | Rationale |
|---|---|
| Maps are data files from day one, shared with the road editor | v1 hard-coded one world; multiple maps and drawn roads were bolt-ons |
| Write the flopped features and feel lessons into the prompt | Avoid relearning steering, handbrake, big-air-hill rebuilds |
| Two launch tracks, not three | Each extra map dilutes polish; easy track authoring matters more |
| No constitution sign-off pause | Prompt fixes the non-negotiables already |

## Files Created

| File | Purpose |
|---|---|
| `research/sundown-run-2-brainstorm.md` | Harvest + D1-D15 decision log |
| `research/sundown-run-2-build-prompt.md` | Paste-ready one-shot build prompt |

## Next Steps

- ⬜ Run the prompt in a new session in `~/Dev/SundownRun2` on Opus 5.5 at `xhigh`

## Atom candidates

<!-- KAI-ATOMS-VERBATIM -->
- DECISION: For a from-scratch rerun of a game build, the new one-shot prompt should fold in every feature the v1 only reached through later sessions plus a written list of what flopped and the feel/engine lessons, rather than reusing the original prompt.
- PATTERN: When a game needs multiple maps and a user track editor, make "maps are data files" the first architectural lock in the build prompt so the editor saves the same format the handcrafted maps use.
<!-- /KAI-ATOMS-VERBATIM -->
