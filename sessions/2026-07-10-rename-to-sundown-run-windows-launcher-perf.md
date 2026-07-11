---
type: auto
session_id: d40606af-c436-4018-b232-45714eaad9fc
project: SundownRun
date: 2026-07-10
topic: Renamed CarDriveGame3d to Sundown Run, published to GitHub, Windows launcher + iGPU perf fix
duration: 3.8 hours
events: 140
---

**Project:** Sundown Run (renamed mid-session from CarDriveGame3d)
**Purpose:** Rename the project for public release, ship a Windows launcher so Josh can run it on his PC, and troubleshoot get-the-repo + frame-rate problems live with Nathan as Josh actually tried it.
**Duration:** 3.8 hours
**Participants:** Nathan, Kai
**Session Restart ID:** `claude -r d40606af-c436-4018-b232-45714eaad9fc`

## Summary

Opened already mid-rename (the project-move itself happened earlier in the session, before this transcript's window) - Kai verified the moved repo worked from its new path, repointed every live cross-project reference from `CarDriveGame3d` to `SundownRun`, and pushed a public GitHub repo with a double-click Windows `.bat` launcher. The rest of the session was live troubleshooting as Nathan tried to get the game onto Josh's Windows PC: a bad `git clone` instruction (fixed), confusion over `gh clone` vs `gh repo clone`, and a severe frame-rate problem that traced back to Windows handing Edge the integrated GPU instead of the RTX 4060 - fixed by forcing the discrete GPU, restoring the panel's full 165fps.

## What We Did

1. Verified the renamed repo (`~/Dev/SundownRun`) worked cleanly from its new path and was in sync with `origin`.
2. Repointed live cross-project references from `CarDriveGame3d` to `SundownRun` in `~/Dev/CLAUDE.md`, both EZ-Cad files, `~/Dev/TIMELINE.md`, `fable-operating-guide.md`, and `AgentTeam/SKILL.md` - left historical session logs and TIMELINE narrative untouched as a record of what the project was called at the time.
3. Added `Sundown Run.bat` (Bun/Node auto-detect, first-run dependency install, dev-server start) plus `.gitattributes` pinning it to CRLF so `cmd.exe` doesn't choke on `goto` labels; verified the exact command it invokes (`bun run start`) serves HTTP 200 headlessly, since the Windows box (192.168.0.70) was offline and the `.bat` itself could not be executed end-to-end.
4. Promoted the orchestrated Fable build prompt out of gitignored `scratchpad/` into `research/fable-orchestrated-build-prompt.md` so the citations in `fable-operating-guide.md` and `AgentTeam/SKILL.md` resolve publicly; stopped tracking `tsconfig.tsbuildinfo`; added `FILE-INDEX.md`.
5. Pushed the renamed project public at github.com/NatMan3000/SundownRun.
6. Rewrote the README's "get it onto Windows" instructions after Nathan reported `git clone` "not working" - traced it to a bad multi-step instruction (git/gh toolchain unnecessary for a first-time user), added a plain download-ZIP path and the Mark-of-the-Web unblock note.
7. Diagnosed a severe in-game frame-rate problem live with Nathan on Josh's laptop (Gigabyte G6 KF 2024, RTX 4060): confirmed via JS-cost-vs-frame-delta (7ms JS, 65ms wall clock) that it was GPU/compositor bound, then via `WEBGL_debug_renderer_info` confirmed Edge was rendering on the Intel iGPU, not the 4060 - forcing Edge to "High performance" graphics restored the panel's native 165fps (vsync-capped, headroom to spare).
8. Documented the iGPU-selection fix in the README's Windows section, alongside the `showFps` config knob and the console snippet to name the active GPU adapter.

## Key Decisions

| Decision | Rationale |
|---|---|
| Leave historical session logs/TIMELINE narrative unrenamed | They record what the project was called at the time; rewriting them would falsify the record |
| Promote the Fable build prompt out of `scratchpad/` into `research/` | It's cited as the worked template by two Kai-system files and needed to resolve publicly once the repo went public |
| Recommend ZIP download over `git`/`gh` clone for Josh | A first-time non-technical Windows user shouldn't need a git toolchain just to get a folder |
| Ship the perf fix as a README note, not code | The bug was a Windows/browser GPU-selection default, not anything in the game - no code changes needed |

## Files Created

| File | Purpose |
|------|---------|
| `Sundown Run.bat` | Windows double-click launcher (Bun/Node auto-detect, deps install, dev server) |
| `.gitattributes` | Forces CRLF on `.bat` |
| `FILE-INDEX.md` | Artifact index for the newly-public repo |
| `research/fable-orchestrated-build-prompt.md` | Promoted from gitignored scratchpad - the worked boss/worker/checker template cited by Kai's Fable tooling |

## Files Modified

| File | Change |
|------|--------|
| `README.md` | Added Windows get-it-running steps (incl. Mark-of-the-Web unblock) and the iGPU-selection perf fix |
| `package.json` | Added `start` script for the launcher to call |
| `.gitignore` | Stopped tracking `tsconfig.tsbuildinfo` |
| `CLAUDE.md`, `TIMELINE.md` | Rename repoint |
| `~/Dev/CLAUDE.md`, `~/Dev/EZ-Cad/CLAUDE.md`, `~/Dev/EZ-Cad/research/geometry-and-print-pipeline-findings.md` | Repointed `CarDriveGame3d` path references to `SundownRun` |
| `~/.claude/projects/-Users-nathan--claude/memory/fable-operating-guide.md`, `~/.claude/skills/AgentTeam/SKILL.md` | Repointed worked-template citation to the new public `research/` path |

## Next Steps

- ⬜ Execute `Sundown Run.bat` on Windows end-to-end (still only verified via the underlying `bun run start` command - the batch logic itself has never run)
- ⬜ Forgejo dual-push for SundownRun (resolved in a later session, 2026-07-11)
- ⬜ EZ-Cad has no git remote configured - the path-fix commit landed locally only until a later session added one

## Open Questions

None outstanding from this session specifically - the iGPU fix and clone instructions were both closed out live.

## Related Sessions

- [2026-07-09 Sundown Run full build](2026-07-09-sundown-run-full-build.md) - the original build this session renamed and shipped publicly
- [2026-07-11 Playground phase](2026-07-11-playground-phase-tricks-scoring-crash-props.md) - next major session, also resolved the Forgejo dual-push thread mentioned above
