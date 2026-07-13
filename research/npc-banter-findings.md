---
type: report
title: In-browser NPC banter spike - findings and verdict
description: CALDERA FM prototype - Gemma 4 E2B on WebGPU generating live DJ banter inside Sundown Run; measurements, scheduling design, and the feasibility verdict
created: 2026-07-14
status: final
---

# In-browser NPC banter - findings

**Verdict up front: it belongs in the game.** The hard problem the spike existed to answer - can a 2B-class model decode on the same GPU as the renderer without breaking the 60fps constitution - has a measured, unambiguous answer on this machine: yes, with room to spare. 208 back-to-back generations during a scripted demo lap did not move the frame-time needle at all. What is NOT settled by a machine: whether Magma Max is funny to a 12-year-old, and whether Josh's GPU behaves like an M5 Max. Both are flagged as playtest items at the bottom.

Everything below was measured live in this session (2026-07-13/14, M5 Max, Chrome 150, 60Hz display, dev server).

## What was built

A `src/banter/` slice behind `CONFIG.radioDj` (default OFF, kid-readable comment in Josh's file):

| Piece | Job |
|---|---|
| `banter.worker.ts` | Web Worker hosting Gemma 4 E2B via transformers.js 4.2.0 on WebGPU. Persona prompt + few-shot, 28-token hard cap per line, one warmup generation before reporting ready. |
| `director.ts` | The scheduler - the actual spike. Polls the game's mutable singletons (tricks ring, zustand store, telemetry) from one rAF loop, turns moments into candidate events with a priority (scheduling) and a HEAT tier (tone), and only dispatches when frames are healthy. |
| `gate.ts` | Kid-safety content gate. Every line passes it before render: blocklist, refusal patterns, ASCII-only, markdown strip, sentence-boundary truncation at 90 chars. Appropriateness beats humour; rejected lines are silently dropped. |
| `BanterHud.tsx` | The CALDERA FM chip, top-centre. Shows a dim "tuning in… N%" during download, then lines that ease in/out. Renders nothing when off or unsupported. |
| `protocol.ts` | Worker message types. |

Model: `onnx-community/gemma-4-E2B-it-ONNX`, dtype q4f16. Loaded through `AutoModelForCausalLM`, which puts transformers.js in cross-architecture text-only mode - it downloads ONLY `embed_tokens` + `decoder_model_merged` (3,131MB), skipping the vision and audio encoders. Weights cache in the browser Cache API per origin.

Dev surfaces: `?dj=1` / `?dj=0` force on/off, `?djstress=1` back-to-back worst-case generation, `?demo=1&djwait=1` holds the perf window until the model is warm, `window.__banter` (state, per-generation log, frame-delta report, `say()`, `gate()`).

## The scheduling design (when generation may fire)

- **Event-triggered only.** Sources: tricks ring (spins/flips/air/combos/wipeouts/geyser launches/crash props), lap completions + new-best laps, shard pickups, hard crashes (telemetry.impact edge), one top-speed call, one greeting. No timers, no idle chatter.
- **Single pending slot with priority.** A newer or higher-priority moment replaces the pending one; nothing queues. Stale moments expire after 3.5s (the moment has passed).
- **HEAT tiers (tone), separate from priority (scheduling).** mild = dry aside (2-point timber tap - also throttled to one per 45s), solid = proper call, wild = biggest call of the night (x3+ combos, 500+ point tricks, 4000+ point wipeouts, geysers, new best laps, all shards). Added mid-spike on Nathan's direction that dynamics must track the size of the moment.
- **Frame-health gate.** rAF-delta EMA must sit within 1.4x of its session baseline, under 20ms absolute, and 500ms clear of the last spike, or the dispatch waits (and the TTL bins it). When frames and banter collide, banter loses.
- **Cooldowns.** 9s between lines, 5s for wild-priority moments.
- **Lazy load.** Worker + model load only when enabled, in the background; the game never waits. `ready` is posted only after a warmup generation absorbs the one-off shader compile.

## Measurements

### Frame impact - the constitution question

| Run | Frame cost avg | Frame cost p99 | Delivered fps |
|---|---|---|---|
| Baseline `?demo=1`, DJ off | 1.66ms | 3.20ms | 60.0, vsync locked |
| **Stress** `?demo=1&djstress=1&djwait=1` - 208 generations back-to-back through the whole 30s window | **1.14ms** | **1.50ms** | **60.0, vsync locked** |

Constitution budget: avg <= 12ms, p99 <= 16.6ms. Both runs sit ~10x under it; the difference between them is run-to-run noise. rAF deltas bucketed by model activity say the same thing: during-generation frames (8,557 samples) avg 16.67ms / p99 17.6ms / max 33.6ms (one dropped vsync in the whole run) vs idle frames avg 16.62ms / p99 17.6ms. In a ~7-minute human play session the same buckets were identical to three decimal places (677 generation frames, max 17.8ms).

The one place jank exists: the **load phase**. While 3.1GB streams from cache into GPU buffers, occasional 100-167ms hitches appear (load-bucket p99 116.8ms). In real use this happens behind the title screen; if it ever matters, load could be deferred until the first idle moment after boot.

### Generation latency and quality

- Decode: **38-39 tok/s** sustained (the 2026-07-13 eval's 250 tok/s came from hand-rolled kernels; ORT WebGPU is ~6x slower, and it does not matter at this line length).
- Prefill: 245-275ms for the ~360-token persona prompt. Total **~550-680ms per line**, event to screen.
- Organic session (Nathan playing, ~7 min): **19/19 lines completed and shown, 0 gate rejections, 0 generation failures**, 9 stale moments expired, 28 replaced by better ones - the scheduler dropping the right things.
- Stress session: 208 requested, 207 completed at read time, 0 rejections, 0 failures.
- The model genuinely reads the event data: a TO THE MOON landing at 29 km/h got "Moon landing! That driver is moving slower than molasses today." It also picked up the volcano canon unprompted ("Smooth as cooling lava flow").
- HEAT works: mild → "Easy little timber. Keep that smooth sailing going now." / wild → "WHOA! That was a massive wipeout! Keep that energy burning bright!"

### Load times

| | Time |
|---|---|
| First ever load (3,131MB download + init) | ~101s + 1.2s warmup |
| Every load after (browser cache) | **3.2s + 0.4s warmup** |

### Content gate

9/9 adversarial cases behaved as designed: profanity, mean-spirited, dark, and refusal lines blocked; token-capped mid-sentence output blocked; markdown/emoji stripped; overlong output trimmed at a sentence boundary; em-dashes normalised; clean lines pass untouched. In ~230 real generations across both sessions the gate never had to fire - the persona prompt held - but it is the guarantee, not the prompt.

### Graceful absence

With `navigator.gpu` removed (simulating Josh's machine worst case): `[banter] unavailable: no WebGPU - feature absent, game unaffected` - no chip, no worker, no errors, game boots and plays normally. A worker-side load failure takes the same path.

### Bundle impact

Main chunk: zero transformers.js references (verified by grep on the built output). The worker is its own 519KB chunk and the ORT wasm a 23.6MB asset - both fetched only when the DJ is switched on. `bun run typecheck` and `bun run build` pass; committed as `ac0485d` with the knob OFF, so main stays safe for Josh's update button.

## Where generation can and cannot fire

- **Can:** any time frames are healthy - which on this hardware was effectively always, including mid-drift at 169 km/h with a human driving. The GPU contention the spike feared did not materialise at this model size on this class of GPU.
- **Cannot (by design):** while the intro card is up, within cooldown of the last line, while another generation is in flight, within 500ms of a frame spike, or when the EMA is elevated - and any moment that waits longer than 3.5s is dropped, so slow machines get fewer lines, never worse frames.
- **Untested here:** a GPU that is actually saturated by the game. On a machine with no headroom the director would starve banter (correct behaviour), but that machine hasn't been measured. Josh's box runs the game at 165fps, which suggests plenty of headroom - if it has WebGPU + fp16, it will likely behave like this one.

## Open issues and directions

1. **Constitution tension - self-containment.** Hard rule 5 says "no external model/texture/font/CDN URLs". The DJ's brain is a 3.1GB download from the HuggingFace Hub on first enable. The spike ships default-OFF so the shipped game remains self-contained, but *adopting* the feature properly needs a deliberate constitution amendment (e.g. "optional features may fetch large assets at runtime when their absence degrades nothing").
2. **Replace trick popups with DJ lines?** (Nathan, mid-spike.) Direction, not built: when the DJ is on, TrickHud popups could slim to points-only and let Magma Max carry the flavour - the HEAT tiers already map trick size to tone, so the wiring exists. Needs a design pass on latency (popups are instant, the DJ takes ~600ms) - probably popups stay for the instant hit and the DJ replaces the *label* flavour, not the score feedback.
3. **Opener variety.** The model leans on "Whoa!"/"WHOA!" openings, especially at wild heat - it anchors on few-shot rhythm exactly as the eval predicted. Fixes to try: more diverse few-shot openers, or a rotating "do not start with X" hint in the event text.
4. **Voice.** The obvious next wonder-moment: pipe gated lines through Web Speech or a small local TTS so the radio actually talks. Unexplored.
5. **Prefill could be cached.** ~260ms of each line is re-prefilling the same persona prompt. transformers.js does not expose KV reuse cleanly today; at current line rates it is not worth chasing.

## Addendum (2026-07-14, same session): two hosts

Nathan's direction after playing: the commentary should switch between personas, each with its own flavour. Built: CALDERA FM now has **Magma Max** (the hype man) and **Doc Cinder** (a deadpan volcano scientist, cinder-cone canon). The HEAT tier routes the speaker - wild moments go mostly to Max, mild ones mostly to Cinder, with deliberate crossover so an occasional bone-dry line lands on a huge trick. Each persona has its own system prompt and few-shot set (same shared rulebook); the chip names the speaker with a per-host accent colour (Max amber, Cinder a cool `#A9C6BF`). Zero perf cost - every line re-prefills its prompt anyway. First organic Cinder line, reacting to a real 2-point timber tap: "Timber settled. Standard procedure for that sequence."

## For the Josh playtest (not machine-verifiable)

- **Is it funny?** 12-year-old laughter is the only meaningful eval. Watch whether he clocks that the DJ is talking about *his* specific trick - that recognition is the wonder moment the spike was for.
- **His machine:** needs Chrome/Edge with WebGPU (`chrome://gpu`) and the one-time ~3.1GB download on his connection. If WebGPU is absent the game is untouched - but the feature silently not existing on the one machine that matters would be a sad ending, so check first.
- Flip `radioDj: true` in `src/core/config.ts` (or visit with `?dj=1`) - and let him find the knob himself.
