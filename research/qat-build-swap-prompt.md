---
type: reference
title: QAT build swap - paste-ready prompt
description: Prompt for the experiment that tests whether transformers.js can load the QAT int4 Gemma build, cutting CALDERA FM's download from 3.13GB to ~1.97GB
created: 2026-07-27
---

# QAT build swap - paste-ready prompt

Background and platform gotchas: `research/gemma-build-variants-and-upgrade-path.md`. Paste the block below into a fresh session rooted in this project.

---

CALDERA FM currently loads `onnx-community/gemma-4-E2B-it-ONNX` at `q4f16` via transformers.js - see `MODEL_ID` and `DTYPE` at the top of `src/banter/banter.worker.ts`. That is a ~3.13GB first download, and the one-time download is a stated blocker on the Josh playtest.

A second build of the same base model exists: `google/gemma-4-E2B-it-qat-mobile-transformers`. QAT int4 rather than post-training q4f16, ~1.97GB, Apache 2.0. Its repo name suggests transformers-compatible weights, but that is an inference, not a verified fact.

Goal: find out whether we can have the smaller download without giving up the maintained library.

What I want to know, in order:

1. **Does it load at all?** Point `AutoModelForCausalLM.from_pretrained` at the QAT repo from the existing worker and see whether transformers.js can consume it. Try the appropriate dtype for a QAT int4 build rather than assuming `q4f16` carries over. If it cannot load, say so plainly and stop - that answers the question and the rest is moot.
2. **What does it actually download?** Confirm the real transferred size, not the repo's stated size. The current build only fetches `embed_tokens` + `decoder_model_merged` because loading a multimodal repo through `AutoModelForCausalLM` puts transformers.js in cross-architecture text-only mode - check whether the same applies here or whether we pull more than we need.
3. **Is it still frame-neutral?** Re-run the existing probes: `?demo=1&djstress=1&djwait=1` for the back-to-back generation stress, and compare against the numbers in `research/npc-banter-findings.md` (baseline 1.66ms avg frame cost, stress 1.14ms, both vsync-locked at 60fps). The constitution budget is avg <= 12ms, p99 <= 16.6ms. If frames regress, that is disqualifying regardless of size.
4. **Decode speed and time-to-line.** Current build sustains 38-39 tok/s with ~550-680ms event-to-screen. Slower is survivable at one line per 9 seconds; much slower is not.
5. **Persona quality - the one that actually decides it.** QAT and q4f16 are genuinely different artifacts, not repackaging, and the personas anchor hard on the few-shot examples (see the comment above `SHARED_RULES`). Generate a decent sample across all three STYLE tiers for both hosts and compare against the current build's voice. Watch specifically for: lines drifting longer than the 12-word rule, the crazytown tier losing its energy, Doc Cinder and Magma Max blurring into the same voice, and any rise in `gate.ts` rejections.

Constraints:

- Behind `CONFIG.radioDj` as always, default off. Do not change any default that affects a normal play session.
- Do not touch `director.ts` or `gate.ts`. This is a model swap, not a scheduling change.
- Do not vendor the WGSL kernels from `github.com/tylerstraub/gemma4-webgpu`. That path is a fork of a research codebase with no API stability, and the speed it buys is irrelevant at this line rate. Out of scope here.
- Keep the change revertible to two constants if it works.

Deliverable: append a dated section to `research/gemma-build-variants-and-upgrade-path.md` with the measurements and a straight verdict - swap, do not swap, or blocked and why. If it is a swap, make the change and update the open-threads entry so the Josh-playtest download figure is correct.

If it turns out transformers.js cannot load the QAT weights at all, note that clearly in the doc and close the thread - the alternative (kernels) is deliberately ruled out, so a negative result ends the branch cleanly rather than leaving it open.
