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
