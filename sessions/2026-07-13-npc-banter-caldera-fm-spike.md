---
type: auto
session_id: 22123dac-d9dd-459c-85d3-56f9623e41eb
project: SundownRun
date: 2026-07-13
topic: NPC banter (CALDERA FM) spike scaffold - in-browser Gemma 4 via WebGPU
duration: 26 minutes
events: 82
---

# NPC banter (CALDERA FM) spike scaffold - in-browser Gemma 4 via WebGPU

**Session Restart ID:** `claude -r 22123dac-d9dd-459c-85d3-56f9623e41eb`

**Duration:** 26 minutes

**Participants:** Nathan, Kai

## Summary

Kicked off from a single prompt pointing at a pre-written Fable spike brief (`research/fable-npc-banter-prompt.md`), this session researched and scaffolded the initial `src/banter/` slice: an in-browser AI drive-time DJ reacting to real telemetry, generated live by Gemma 4 E2B over transformers.js on WebGPU in a Web Worker. Most of the session was research - confirming transformers.js 4.2.0 actually supports Gemma 4 (via `AutoModelForCausalLM` cross-architecture text-only mode, which skips the vision/audio encoders and only pulls the ~3.1GB text weights) - before writing the worker, scheduler, content gate, and HUD chip. The heavier measurement/tuning work (frame-cost benchmarking, two-persona evolution, voice) happened in later sessions on 2026-07-14, already captured in TIMELINE.md and `research/npc-banter-findings.md`.

## What We Did

1. Read the Fable spike brief and surveyed the existing frozen-core layout (`src/core/`, `src/ui/`, `src/dev/`, `src/vehicle/`, `src/net/`, `src/fx/`) plus trick/telemetry emission points (`trickDetector.ts`, `Geysers.tsx` launch events) to find real hook points for banter triggers
2. Researched transformers.js Gemma 4 support directly against the npm registry, HuggingFace model API, jsDelivr-hosted source, and the ONNX repo's chat template - confirmed `onnx-community/gemma-4-E2B-it-ONNX` (q4f16) loads via `AutoModelForCausalLM` in text-only mode, avoiding the multimodal encoders
3. Installed `@huggingface/transformers` and verified the gemma4 modeling path exists in `node_modules`
4. Wrote `src/banter/protocol.ts` (worker message types), `banter.worker.ts` (Web Worker hosting the model + persona prompt/few-shot generation), `director.ts` (event-triggered scheduler polling game telemetry), `gate.ts` (kid-safety content filter), and `BanterHud.tsx` (the on-screen chip)
5. Wired `CONFIG.radioDj` into `src/core/config.ts` (default OFF) and mounted the HUD chip + dev toggles into `HUD.tsx`, `DemoDrive.tsx`, `DevTools.tsx`

## Key Decisions

| Decision | Rationale |
|---|---|
| Text-only `AutoModelForCausalLM` load path over the full multimodal Gemma 4 pipeline | Cuts the download from a multimodal model bundle to ~3.1GB (embed_tokens + decoder_model_merged only) - the game only needs text generation |
| Event-triggered scheduling design (no idle chatter/timers) from the start | Keeps banter tied to real moments (tricks, wipeouts, laps, shards) rather than filler, and keeps the frame-health gate meaningful |
| `CONFIG.radioDj` defaults OFF | Untested feature behind a Josh-readable knob, consistent with the project's convention of shipping new systems opt-in until playtested |

## Files Created

| File | Description |
|------|-------------|
| `src/banter/protocol.ts` | Worker message type definitions |
| `src/banter/gate.ts` | Kid-safety content filter for generated lines |
| `src/banter/banter.worker.ts` | Web Worker hosting Gemma 4 E2B (transformers.js, WebGPU) |
| `src/banter/director.ts` | Event-triggered banter scheduler |
| `src/banter/BanterHud.tsx` | CALDERA FM on-screen chip |

## Files Modified

| File | Description |
|------|-------------|
| `src/core/config.ts` | Added `radioDj` knob |
| `src/ui/HUD.tsx` | Mounted `BanterHud` |
| `src/dev/DemoDrive.tsx`, `src/dev/DevTools.tsx` | Dev toggles/harness for the banter system |

## Next Steps

- Frame-cost benchmarking and stress testing (done same-day in a later session - see `research/npc-banter-findings.md`)
- Two-persona (Magma Max / Doc Cinder) evolution + voice layer (done 2026-07-14, see TIMELINE.md)
- Josh playtest verdict on whether the DJ is funny, and whether his machine has WebGPU - tracked as open thread "CALDERA FM radio DJ - Josh playtest + adoption decisions"

## Related Sessions

- [2026-07-12 LAN multiplayer, banked curves, world map, Learn-to-Code doc](2026-07-12-multiplayer-banked-curves-world-map-learn-to-code.md)
- Findings + measurements: [research/npc-banter-findings.md](../research/npc-banter-findings.md)
