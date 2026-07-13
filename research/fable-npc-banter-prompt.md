---
type: reference
title: Fable prompt - in-browser NPC banter exploration
description: Paste-ready Fable 5 prompt for a feasibility spike - live Gemma-4-E2B-class WebGPU NPC banter inside Sundown Run, grounded in the 2026-07-13 browser-model eval
created: 2026-07-13
status: ready
---

# Fable prompt - in-browser NPC banter spike

Run from `~/Dev/SundownRun` on `claude-fable-5`, effort **high**. Origin: 2026-07-13 Kai session - in-browser Gemma 4 E2B eval (results banked in nexus `local_models` / `local_model_evals`, model_id `gemma-4-E2B-it-qat-mobile-webgpu`).

---

```
I'm working on Sundown Run, the golden-hour driving game I built for my 12-year-old son Josh - the whole project exists to make him light up and pull him into coding. I want to explore giving the game a voice: an in-world character whose lines are generated LIVE by a small language model running entirely in the browser on WebGPU, reacting to what Josh actually does - tricks, crashes, geyser launches, race wins. When he realises the game is talking about the thing he just did, and that no server is involved, that's the wonder moment this spike is for. With that in mind: build a working prototype of in-browser NPC banter and give me an honest feasibility verdict.

Ground yourself first: read CLAUDE.md, CONSTITUTION.md, open-threads.md, and src/core/config.ts. The CONSTITUTION is binding - especially the 60fps performance budget. Check .fable-lessons/ for notes from prior runs.

What I know going in (from today's eval of the HF Space webml-community/gemma-4-webgpu-kernels, on this machine, M5 Max):
- Gemma 4 E2B QAT mobile: ~2GB weights, browser-cached after first load, ~250 tok/s decode at small context, prefill ~1.4K tok/s, practical context 1-8K tokens.
- It is excellent at short constrained generation and format adherence, unreliable on facts, and it anchors hard on in-context examples - any few-shot lines in its prompt must be flawless because it will imitate them exactly.
- The maintainable integration path is transformers.js (@huggingface/transformers) in a Web Worker with google/gemma-4-E2B-it-qat-mobile-transformers or an equivalent ONNX build - the Space's hand-rolled kernels are a showcase, not a dependency. If E2B proves too heavy for the frame budget, trying a smaller model class instead is squarely on the table.

The hard problem, and the reason this is worth your time: the model and the renderer share one GPU, and the CONSTITUTION's 60fps budget is non-negotiable. A decode burst that stutters the frame pacing kills the feature. Solving the scheduling - when banter generation is allowed to fire relative to game state, how long a burst can be, what gets dropped under load - IS the spike. Advanced approaches are welcome here: telemetry-gated generation windows, hard token caps per line, pre-generating during menus or round transitions, whatever the frame-time evidence supports. The game already exposes everything you need: zustand store + telemetry in src/core/, and the ?demo=1 autopilot lap that records frame times to window.__perf.

Success looks like:
- A prototype behind a CONFIG knob in src/core/config.ts, default OFF, with a kid-readable comment - config.ts is Josh's file. Who speaks is your creative call (radio DJ, pit chief, a character that fits the volcanic caldera canon in CLAUDE.md) - pick what lands the wonder moment, and keep every line short enough to read at speed.
- Lines react to real telemetry events, not canned triggers with model garnish.
- The game never waits for the model: lazy background load, banter lights up when warm, and on a machine without WebGPU the feature is simply absent with zero degradation. Assume Josh's Windows machine may be one of those.
- Kid-appropriate output by construction: tight persona prompt, hard cap on line length, and a client-side content gate before anything renders. Tiebreak: appropriateness beats humour, every time.
- 60fps holds WHILE generating - proven, not asserted. Run ?demo=1 with banter generation forced during the lap and put the window.__perf frame-time comparison (banter on vs off) in the findings. Tiebreak: if frame pacing and banter collide, banter loses - skip or defer generation, never drop frames.
- bun run typecheck and bun run build pass. Commit at working milestones, but main must stay safe for Josh's update button (it hard-resets to origin/main) - the default-off knob is what makes committing safe.
- A findings report at research/npc-banter-findings.md: what you built, measured load time and frame-time cost, where generation can and cannot fire, and your straight verdict on whether this belongs in the game - including "it does not" if that is what the evidence says.

Before reporting progress, audit each claim against a tool result from this session - if a measurement or test failed, say so with the output. Whether the banter is actually FUNNY to a 12-year-old is not machine-verifiable: flag it for a Josh playtest in your final summary rather than claiming it. When you have enough information to act, act. Don't add features, refactor, or introduce abstractions beyond what this spike requires. Final message: outcome first, complete sentences.
```

---

**Run notes (not part of the prompt):**

- Effort `high` is right for a scoped spike; `xhigh` only if the frame-pacing problem turns out to be genuinely gnarly.
- Solo Fable is fine - one seam, no orchestration needed. It may spawn a fresh-context checker for the perf claim on its own; that instinct is welcome.
- First model download in dev is ~2GB - let it run once before judging load UX.
- The eval evidence behind the numbers: nexus `local_model_evals`, eval `browser-classify-extract-2026-07-13`.
