# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Overview

**Sundown Run** - a golden-hour, open-world 3D driving game built for (and eventually by) Josh. Vite + React 19 + `@react-three/fiber` v9 + `@react-three/rapier` physics, Bun runtime. Shipped; remaining work is post-ship polish (`open-threads.md`).

## Stack

- Vite 8 + React 19, `@react-three/fiber` v9, `@react-three/drei`, `@react-three/rapier` v2, `@react-three/postprocessing`, three.js 0.185, zustand 5
- Bun (install/dev/build), TypeScript 7 (`tsc -b`)
- Dev server: **port 5199, strictPort** - `bun run dev` -> http://localhost:5199

## Running it

| What | Command / file | Notes |
|------|----------------|-------|
| Play (single player) | `bun run dev` -> http://localhost:5199 | `bun run start` also opens the browser |
| **Host multiplayer** | `bun run mp` | Starts the WS relay (port 5200) + vite `--host`, prints join links. Only the HOST runs this - everyone else just opens the printed `http://<host-ip>:5199/?mp=1&name=...` link in a browser (nothing installed on their machine) |
| Relay alone | `bun run relay` | Rarely needed - `mp` includes it |
| Build / typecheck | `bun run build` / `bun run typecheck` | `tsc -b` + vite build; the ship gate |
| Windows: play | `Sundown Run.bat` | Finds bun OR node/npm, installs deps on first run |
| Windows: host multiplayer | `Sundown Run Multiplayer.bat` | Requires Bun (offers to install it, Y/N); adds the inbound firewall rule for 5199-5200 via a one-time admin YES - without that rule Windows silently blocks other computers. Never type `bun/npm run mp` into PowerShell on these machines - execution policy blocks the `.ps1` shims |
| Windows: update | `Sundown Run Update.bat` | `git fetch` + `reset --hard origin/main` + `git clean -fd` - nukes local changes by design (Josh's do-over button) |
| World map | `bun run map` -> `World Map.html` (Windows: `Sundown Run Map Gen.bat` - regenerates + opens it) | Interactive top-down map generated FROM the game code (terrain exports: CIRCUIT/JUMPS/BANKS/PLAYGROUNDS + heightfield render); clickable markers explain each feature and point at the code that makes it. Regenerate + commit after any world change. Roaming shards are random per round, so the map carries one hunt-note pin + the fixed crater-shard pin. |
| Learn to code | `bun run learn` -> `Learn To Code.html` | Josh's interactive coding workshop: 10 chapters with in-page runnable playgrounds (drag race, terrain function, game loop...), a TypeScript quiz, and real missions in the actual game files - every concept anchored to real code via the same generate-time file:line vscode links as the map. Regenerate after refactors that move the anchored lines. |

Multiplayer activation is URL-driven (`?mp=1&name=JOSH&color=red`) because both machines share the repo's config.ts through the host's dev server - the URL is the only per-machine channel. Firewall debugging: friends failing to connect is almost always the HOST's inbound firewall on 5199/5200 (Windows: the bat's rule; macOS: allow bun in System Settings -> Network -> Firewall).

## Architecture

- **`CONSTITUTION.md`** - the binding standard. Art direction ("Golden Hour" - warm low sun, long shadows, atmosphere-everywhere), the 60fps performance budget, and gameplay feel rules. All disputes are settled against this document, never against taste-in-the-moment. Amend deliberately, never drive-by.
- **`src/core/config.ts`** - Josh's kid-facing knob file. Every tunable (car colour, engine power, grip, camera, time of day) lives here; editing it hot-reloads in the browser. This is the intended entry point for a non-technical collaborator - see the README's "Josh: this bit is for you" section.
- **`src/net/`, `server/relay.ts`, `server/mp.ts`** - LAN multiplayer: `bun run mp` starts a Bun WebSocket relay (port 5200) plus vite `--host`; activation is `?mp=1`. Detail: `docs/architecture-multiplayer-banter.md`.
- **`src/banter/`** - CALDERA FM, the in-browser AI radio station (`CONFIG.radioDj`, default OFF; Gemma 4 E2B via transformers.js on WebGPU in a Web Worker). Detail: `docs/architecture-multiplayer-banter.md`.
- **`src/core/` / `src/vehicle/` / `src/world/` / `src/fx/` / `src/audio/` / `src/ui/` / `src/dev/`** - frozen core contracts (config / telemetry / store / terrain API) let multiple agents own separate slices of the repo without merge conflicts. Ownership boundaries used during the build:
  - **world** - terrain, track, trees, boundary/collision
  - **drive** - vehicle physics, steering, camera, laps
  - **look** - lighting, post-processing, materials, sky
  - **avui** - audio, HUD, UI, title screen, garage

## World canon

The world is the caldera of an old volcano (Nathan + Josh ruling, 2026-07-12) - the rim IS the crater rim, and new features should lean volcanic. First wave: **geysers** (`src/world/Geysers.tsx` - rhythmic steam vents that hurl the car skyward, `CONFIG.geysers`) and the **cinder cone** (a breached crater landform, `PLAYGROUNDS` kind `'cone'`, hiding shard #11). Candidate future ideas (discussed, not built): dozing rumble + tremor, fumaroles + basalt-flow paint on the rim, cracked-mud playa. No caves/lava tubes - heightfield terrain cannot do overhangs.

## Dev surfaces

- `?demo=1` - scripted autopilot lap segment, records frame times to `window.__perf` (used by the performance checks)
- `?demo=1&cut=1` - same demo with a fixed camera-cut sequence
- `window.__game` / `window.__perf` / `window.__delights` / `window.__banter` - runtime dev inspection hooks
- `?dj=1` / `?dj=0` - force the CALDERA FM radio DJ on/off (overrides `CONFIG.radioDj`); `?djstress=1` back-to-back generation worst-case probe; `?demo=1&djwait=1` holds the perf window until the model is warm

## Gotchas

- **Rapier heightfield colliders are infinitely thin** - a body descending faster than ~28m/s in one 60Hz step can tunnel straight through, and rapier CCD does not arm on it. Backstop: a catch-floor slab plus a below-terrain auto-reset.
- **`BufferGeometryUtils.mergeGeometries` returns `null` silently** when mixing indexed and non-indexed geometries (e.g. `ExtrudeGeometry` is non-indexed, `CylinderGeometry`/`BoxGeometry` are indexed) - never non-null-assert its result, check for `null` explicitly.
- **Fogging distant scenery toward a solid colour reads as a flat slab** against a gradient sky, with a hard top edge. Fix: dissolve far geometry by vertex alpha toward zero at the summit (`fog: false`) so the sky shows through, and bake the fog colour into low-altitude vertex colours to keep it visually tied to the fogged mid-ground (the "D-FOG" atmospheric bridge).
- **Two coplanar authored faces z-fight as a whole-face moire** (e.g. a roof-glass surface copied from the roof's own points). Fix with real geometric separation (a few mm drop), never `polygonOffset`.
- **Never drive a kinematic body through the declarative `<RigidBody>` component** - @react-three/rapier also feeds a kinematic body's target from its own scene-graph transform every frame, which fights your `setNextKinematicTranslation` and leaves the body trailing seconds behind (symptom: physics callback runs at 60Hz with fresh targets but `body.translation()` never matches the previous target). Create the body imperatively (`world.createRigidBody`) and pose the visual as a plain three group - see `src/net/RemoteCars.tsx`.

