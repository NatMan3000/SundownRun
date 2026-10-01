# File Index

Artifact index for Sundown Run. Source code (`src/`), sessions, and scratchpad
are not indexed - see `~/.claude/rules/governance/file-index.md`.

## Root

| File | Retention | Description |
|------|-----------|-------------|
| `CONSTITUTION.md` | permanent | The binding standard - art direction, 60fps budget, feel rules. All disputes settle here. |
| `CLAUDE.md` | permanent | AI context anchor - stack, architecture, gotchas, build process. |
| `README.md` | permanent | Human documentation - how to run, controls, Josh's config knobs. |
| `TIMELINE.md` | permanent | Chronological project events with session log links. |
| `open-threads.md` | permanent | Discussions-in-progress across sessions. |
| `Sundown Run.bat` | permanent | Windows launcher - detects Bun/Node, installs deps, starts the game, opens browser. |
| `.gitattributes` | permanent | Forces CRLF on `.bat` so cmd.exe parses labels correctly. |

## research/

| File | Retention | Description |
|------|-----------|-------------|
| `fable-orchestrated-build-prompt.md` | reference | The single prompt that built the whole game via a boss/worker/checker agent team. Cited as the worked template by Kai's Fable operating guide and the AgentTeam skill. |
| `fable-npc-banter-prompt.md` | reference | Paste-ready Fable prompt for the in-browser WebGPU NPC banter feasibility spike (grounded in the 2026-07-13 Gemma 4 E2B browser eval; results in nexus local_models). |
| `gemma-build-variants-and-upgrade-path.md` | reference | Which Gemma 4 E2B build CALDERA FM actually runs (ONNX q4f16, 3.13GB) vs the faster QAT/WGSL build evaluated in the 2026-07-13 Kai session, why they diverged, and the transformers.js QAT test that could cut the download to ~1.97GB. |
| `qat-build-swap-prompt.md` | reference | Paste-ready prompt for the QAT-build swap experiment - the actionable out of the build-variants doc. |
| `npc-banter-findings.md` | reference | CALDERA FM spike - Gemma 4 E2B on WebGPU generating live DJ banter in-browser; measurements, scheduling design and feasibility verdict |
| `sundown-run-2-brainstorm.md` | reference | Sundown Run Two brainstorm with Josh: what v1 grew into, what flopped, feel and engine lessons, and the D1-D14 decision log. |
| `sundown-run-2-build-prompt.md` | reference | Paste-ready Opus 5.5 one-shot prompt that builds Sundown Run Two (neon, tracks-as-data, road editor, Ai racers) in `~/Dev/SundownRun2`. |

## scripts/

| File | Retention | Description |
|------|-----------|-------------|
| `learn-to-code.ts` | permanent | Generates "Learn To Code.html" - a ten-chapter interactive coding workshop for Josh anchored in Sundown Run's real code |
| `world-map.ts` | permanent | Generates "World Map.html" - interactive top-down map of the whole world, built from the real terrain/road/jump code |
