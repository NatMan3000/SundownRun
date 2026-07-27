---
type: auto
session_id: bcc9ea9d-f3fa-40cf-be61-e57f72ccd560
project: SundownRun
date: 2026-07-27
topic: Gemma build reconciliation (ONNX vs QAT/WGSL) + QAT swap experiment banked
duration: 1 hour
events: 713
---

# Session Log: 2026-07-27 - Gemma Build Reconciliation + QAT Swap Experiment

**Project:** SundownRun
**Purpose:** Side branch of a YCOS agentic-OS session - resolve which Gemma 4 E2B build CALDERA FM actually runs, why two conflicting memories both felt true, and bank the download-shrinking experiment that falls out of it
**Duration:** ~1 hour (within a 4.3-hour YCOS session)
**Participants:** Nathan, Kai

**Session Restart ID:** `claude -r bcc9ea9d-f3fa-40cf-be61-e57f72ccd560`

---

## Summary

Nathan asked whether SundownRun's in-browser Gemma was worth looking at for YCOS. That surfaced a genuine record conflict: Nathan remembered a whole evaluation campaign on the *fast* WGSL-kernels build and believed it went into the game, while the code plainly runs the ONNX build. Both memories were true - the campaign happened in a Kai session on 2026-07-13, but the handoff to this project was a Fable prompt rather than code, so the kernels runtime never travelled. Documented properly this time, with the actionable experiment that falls out of it: the QAT repo may load directly in transformers.js, which would be a **-37% download for a two-constant change**.

No game code changed. Nathan's three WIP files in `src/banter/` were left untouched and the commit was scoped around them.

---

## What We Did

1. **Established what the game actually runs, from the code.** `src/banter/banter.worker.ts:20-21` - `MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX'`, `DTYPE = 'q4f16'`, ~3.13GB via transformers.js. No `.wgsl` files anywhere in the repo, no reference to `webgpu-kernels` or `qat-mobile` in `src/`.
2. **Established that the two builds are siblings, not interchangeable packaging.** `google/gemma-4-E2B-it-qat-mobile-transformers` is QAT int4 (Google retrained the weights to survive int4) running on 44 hand-written WGSL kernels: 1.97GB, 240-267 tok/s. The ONNX build is post-training quantisation on ONNX Runtime WebGPU: 3.13GB, 38-39 tok/s. Different quantisation *method* and different inference engine, so the 2026-07-13 4/5 eval score does not automatically transfer to what the game runs.
3. **Reconstructed the real history** from the Kai session transcript (`4d2e4607`, 2026-07-13): the HF Space was loaded, chat cleared, targeted evals run against agreed use cases ("it is super quick in its responses"), banked in the models database, ruled out for Power Platform Code Apps, kept as a candidate for *"ycos or nexus, or sundown run, worldmaphistory"* - and then handed off with an explicit *"I dont want to do implimentation here"* plus a Fable prompt. The game build a day later made its own model choice and took the installable path, recording the 6x decode gap as an accepted tradeoff (`research/npc-banter-findings.md:55`).
4. **Confirmed the speed gap does not matter for the game.** At one line every ~9 seconds, generated in the background, 600ms is invisible. The distinction only bites for an interactive command bar, which is a YCOS question, not a game one.
5. **Banked the platform gotchas found while checking:** `shader-f16` requirement, ~2.3GB GPU floor, per-origin cache (each origin pays the download separately), evictable under storage pressure unless `navigator.storage.persist()` is used, and the Windows `subgroupAdd` bug that produced **corrupted output while loading successfully** on NVIDIA (fixed upstream, but silently-wrong is the notable failure mode).
6. **Wrote the handover** - research doc, paste-ready experiment prompt, open thread, and both FILE-INDEX rows - so the work can continue in a SundownRun-rooted session.

---

## The Experiment Worth Running

Test whether transformers.js can load `google/gemma-4-E2B-it-qat-mobile-transformers` directly - the repo name suggests transformers-compatible weights. If it loads, that is **3.13GB → 1.97GB for a two-constant change** in `banter.worker.ts`, which directly shrinks the one-time-3.1GB download blocker sitting in the Josh-playtest thread. Costs a persona A/B, since QAT vs q4f16 is a real quality difference and the few-shot anchoring is sensitive.

Adopting the actual WGSL kernels is a separate and probably bad idea: reference implementation, no API stability, zero gameplay benefit, and vendoring means owning 44 kernels solo.

---

## Key Decisions

| Decision | Rationale |
|---|---|
| Record the two-build history in the project rather than leave it in a Kai session | The project record only captured one build, which is why the conflict survived two weeks |
| Test the QAT repo via transformers.js, not the kernels | A two-constant change with a real payoff vs vendoring an unstable reference implementation |
| Leave the game's ONNX build alone unless the swap tests clean | It works, Nathan played it the day before, and the speed gap is invisible at this line length |
| Scope the commit around Nathan's three WIP files | `BanterHud.tsx`, `radioAudio.ts` and `config.ts` were dirty and not this session's work |

---

## Files Created

| File | Purpose |
|---|---|
| `research/gemma-build-variants-and-upgrade-path.md` | Both builds side by side, the real two-session history, platform gotchas |
| `research/qat-build-swap-prompt.md` | Paste-ready prompt to run the swap experiment in a SundownRun-rooted session |

## Files Modified

| File | Change |
|---|---|
| `open-threads.md` | New thread: "QAT build swap - cut the 3.1GB download to ~1.97GB" |
| `FILE-INDEX.md` | Rows for both new research files |

Committed and pushed as `632d990`.

---

## Next Steps

- ⬜ Run the QAT swap experiment with `research/qat-build-swap-prompt.md` - does transformers.js load the QAT repo directly?
- ⬜ If it loads: persona A/B (QAT vs q4f16) before making it the default
- ⬜ Feeds the existing CALDERA FM thread - a 1.97GB download materially changes the Josh-playtest calculus

## Related Sessions

- [YCOS - agentic-OS research pack](file:///Users/nathan/Dev/YCOS/sessions/nathan/2026-07-27-agentic-os-research-pack.md) - the parent session this branched off
- [Kai - Opus 5 sweep, UpdateCheck, harness audit](file:///Users/nathan/.claude/sessions/2026-07-27-opus5-sweep-updatecheck-harness-audit.md) - the concurrent Kai-side work
- [2026-07-13 CALDERA FM spike](file:///Users/nathan/Dev/SundownRun/sessions/2026-07-13-npc-banter-caldera-fm-spike.md) - where the ONNX choice was made
