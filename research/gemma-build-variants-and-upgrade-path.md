---
type: research
title: Gemma 4 E2B build variants - what CALDERA FM runs, and the upgrade path
description: Two different builds of Gemma 4 E2B were involved in this project's history; this records which one the game actually runs, why, and the concrete option to cut the 3.1GB download
created: 2026-07-27
---

# Gemma 4 E2B build variants - what CALDERA FM runs, and the upgrade path

Written 2026-07-27 to close a genuine confusion: **two different builds of the same base model** were in play across two sessions, and the project record only captured one of them.

## The two builds

| | What the game runs | The other one |
|---|---|---|
| Repo | `onnx-community/gemma-4-E2B-it-ONNX` | `google/gemma-4-E2B-it-qat-mobile-transformers` |
| Quantization | q4f16 (post-training) | QAT int4 (quantization-aware training) |
| Runtime | transformers.js / ONNX Runtime WebGPU | ~44 purpose-built WGSL kernels, raw WebGPU |
| Download | ~3.13 GB | ~1.97 GB |
| Decode | 38-39 tok/s (M5 Max) | 240-267 tok/s (M-series); 125+ tok/s (RTX 5090) |
| Licence | Apache 2.0 | Apache 2.0 |

Same base weights lineage, but **not interchangeable artifacts** - the quantization method and the inference engine both differ. QAT retrains the weights to survive int4, so output quality is not assumed equivalent to naive post-training q4f16.

## How the history actually went

1. **2026-07-13, Kai session `4d2e4607`.** Nathan found `webml-community/gemma-4-webgpu-kernels` (the fast QAT + WGSL build), ran it live in the browser, ran targeted evals against agreed use cases, scored it 4/5 on browser-classify-extract, and banked it in the local-models registry. Ruled out for Power Platform Code Apps; kept as a candidate for "ycos or nexus, or sundown run, worldmaphistory".
2. **Same session,** Nathan: *"let's explore the SundownRun NPC banter idea. I dont want to do implimentation here, but if you can bank a good fable prompt to get it started into that project and i will explore it furthur there."* The handoff to this project was a **Fable prompt, not code** - `research/fable-npc-banter-prompt.md`.
3. **2026-07-13/14, in this project.** The CALDERA FM spike was built and independently chose the installable path: transformers.js + the ONNX build. `research/npc-banter-findings.md:55` records the tradeoff explicitly - *"the 2026-07-13 eval's 250 tok/s came from hand-rolled kernels; ORT WebGPU is ~6x slower, and it does not matter at this line length."*

**So the kernels runtime never travelled across the handoff.** The original intent pointed at the fast build; the implementation took the maintained-library path. Both were reasonable; the record just never said so in one place. Verified 2026-07-27 against `src/banter/banter.worker.ts:20-21` (`MODEL_ID`, `DTYPE`) and the absence of any `.wgsl` file in the tree.

## The upgrade path worth testing

The open thread lists the **one-time 3.1GB download** as a Josh-playtest blocker (alongside the WebGPU check on his machine). That blocker may be cheap to shrink:

**Test whether transformers.js can load `google/gemma-4-E2B-it-qat-mobile-transformers` directly.** The repo is named `-transformers`, which suggests transformers-compatible weights. If it loads:

- Download drops **3.13 GB to ~1.97 GB** (-37%) for a change to two constants in `banter.worker.ts`.
- You keep the maintained library - no kernel maintenance.
- Decode speed through ORT WebGPU is unknown and probably stays near 38 tok/s, which does not matter at this line length.
- Output quality would need a quick A/B on the personas, since QAT vs q4f16 is a real difference and the few-shot anchoring behaviour is sensitive (see the persona comment at `banter.worker.ts:31`).

**Adopting the actual WGSL kernels is a different proposition and probably not worth it here.** The source is public and Apache 2.0 (`github.com/tylerstraub/gemma4-webgpu`), but its own README says it is *"not a framework or a drop-in library. It's a reference you fork, adapt, and learn from"*, with no API stability. That is a real maintenance surface for zero gameplay benefit - the speed is already irrelevant at one line per 9 seconds.

## Platform gotchas found 2026-07-27

Relevant to the Josh playtest regardless of which build is used:

- **`shader-f16` WebGPU feature is required** by the kernels build; it throws at init without it.
- **~2.3 GB GPU memory floor** for Gemma 4 E2B.
- **Windows WebGPU subgroup corruption** (HF Space discussion #8): on Chrome/Dawn/D3D12/NVIDIA, bare `subgroupAdd` in the QatMatMul kernels produced **corrupted repetitive output while loading successfully** - confirmed on RTX PRO 6000 Blackwell and RTX 5070. Fixed upstream with `sgExact32` guards. This affects the kernels build, not the ONNX path, but it is the failure mode to watch for: wrong output, not a crash.

## Sources

- [Space: gemma-4-webgpu-kernels](https://huggingface.co/spaces/webml-community/gemma-4-webgpu-kernels) · [Windows corruption discussion](https://huggingface.co/spaces/webml-community/gemma-4-webgpu-kernels/discussions/8)
- [Reference implementation (Apache 2.0)](https://github.com/tylerstraub/gemma4-webgpu)
- [QAT model repo](https://huggingface.co/google/gemma-4-E2B-it-qat-mobile-transformers)
