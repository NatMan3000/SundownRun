---
type: auto
session_id: 22123dac-d9dd-459c-85d3-56f9623e41eb
project: SundownRun
date: 2026-07-13..14
topic: NPC banter (CALDERA FM) spike scaffold + two-host evolution + voice layer (benched)
duration: 2.5 hours
events: 297
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

## Continued - 2026-07-14

Same-day continuation, driven by Nathan actually playing with the DJ live. Evolved the single-persona spike into a two-host, style-tiered system, built a full TTS voice layer, then benched it on Nathan's own listen-verdict.

- Split into two heat-routed hosts - **Magma Max** (hype man) and **Doc Cinder** (deadpan scientist) - each with its own few-shot persona and HUD chip accent
- Added STYLE delivery tiers (one-word / standard / crazytown) with per-style few-shot prompts, token budgets, and gate envelopes for variable-length reactions
- Tuned airtime to ~1-in-5 heat-weighted trick landings getting a call (wipeouts always call), with a session tally to avoid over-chatter
- Added opener anti-repetition so consecutive lines don't reuse the same intro
- Built a full voice layer end-to-end: Supertonic-TTS-2 running in the same worker, per-host voice presets, an FM-band EQ chain, game-mix ducking, and end-of-clip cooldown - measured frame-neutral
- Nathan's listen verdict: the voices were **off-putting** - on-screen text comments alone read better. `radioVoice` now defaults OFF; the voice layer sits dormant, built but unused, for Josh to try if he wants
- Fixed a dev-only ghost-DJ bug: Vite HMR was orphaning the worker + audio chain on module swap (`import.meta.hot.dispose` used - Vite 8 has no `decline`)
- Fixed a content-gate false positive where the refusal filter was anchored to line start
- Minor HUD polish: `BanterHud.tsx` fade duration 300ms -> 500ms

### New Decisions

| Decision | Rationale |
|---|---|
| Voice layer built but shipped OFF by default | Frame-neutral and functionally complete, but Nathan's own listen-through judged it "off-putting" - on-screen text is enough. Left in place (not deleted) for Josh's playtest call. |
| Two-host heat routing over a single persona | More variety without more chatter - low-heat lines route to Doc Cinder, high-heat/hype moments to Magma Max |

### New Files / Modified (this continuation)

Commits `ac0485d` -> `bd19749` (see `git log`): `src/banter/*` (director, gate, protocol, radioAudio.ts new), `src/audio/AudioEngine.ts`, `src/ui/HUD.tsx`, `src/dev/DemoDrive.tsx`, `src/dev/DevTools.tsx`, `src/core/config.ts`, `research/npc-banter-findings.md` (findings addenda 2-4), plus an uncommitted `BanterHud.tsx` fade-timing tweak swept up by this session.

## Next Steps

- Josh playtest verdict: is the DJ funny; does his machine have WebGPU; may flip `radioVoice` on himself
- Trick-popup-vs-DJ-line integration decision
- Constitution amendment if the feature is adopted long-term

## Related Sessions

- [2026-07-12 LAN multiplayer, banked curves, world map, Learn-to-Code doc](2026-07-12-multiplayer-banked-curves-world-map-learn-to-code.md)
- Findings + measurements: [research/npc-banter-findings.md](../research/npc-banter-findings.md)
