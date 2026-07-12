# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Overview

**Sundown Run** - a golden-hour, open-world 3D driving game built for (and eventually by) Josh. Vite + React 19 + `@react-three/fiber` v9 + `@react-three/rapier` physics, Bun runtime. Built end-to-end - blank repo to unconditional sign-off - in a single orchestrated multi-agent session (2026-07-09).

## Current Phase

**Shipped / DONE.** Both independent checker passes signed off against `CONSTITUTION.md` (checker-1 found and the `drive` worker fixed a first-minute drift-physics blocker; checker-2 verified real GPU-timed 60fps performance + a clean-clone build gate). All build agents shut down. Remaining work is post-ship polish - see `open-threads.md`.

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
| Windows: host multiplayer | `Multiplayer.bat` | Requires Bun (offers to install it, Y/N); adds the inbound firewall rule for 5199-5200 via a one-time admin YES - without that rule Windows silently blocks other computers. Never type `bun/npm run mp` into PowerShell on these machines - execution policy blocks the `.ps1` shims |
| Windows: update | `Get Updates.bat` | `git fetch` + `reset --hard origin/main` + `git clean -fd` - nukes local changes by design (Josh's do-over button) |
| World map | `bun run map` -> `World Map.html` | Interactive top-down map generated FROM the game code (terrain exports: CIRCUIT/JUMPS/BANKS/PLAYGROUNDS + heightfield render); clickable markers explain each feature and point at the code that makes it. Regenerate + commit after any world change. Shard positions are hand-mirrored from Delights.tsx buildShards() - update both. |

Multiplayer activation is URL-driven (`?mp=1&name=JOSH&color=red`) because both machines share the repo's config.ts through the host's dev server - the URL is the only per-machine channel. Firewall debugging: friends failing to connect is almost always the HOST's inbound firewall on 5199/5200 (Windows: the bat's rule; macOS: allow bun in System Settings -> Network -> Firewall).

## Architecture

- **`CONSTITUTION.md`** - the binding standard. Art direction ("Golden Hour" - warm low sun, long shadows, atmosphere-everywhere), the 60fps performance budget, and gameplay feel rules. All disputes are settled against this document, never against taste-in-the-moment. Amend deliberately, never drive-by.
- **`src/core/config.ts`** - Josh's kid-facing knob file. Every tunable (car colour, engine power, grip, camera, time of day) lives here; editing it hot-reloads in the browser. This is the intended entry point for a non-technical collaborator - see the README's "Josh: this bit is for you" section.
- **`src/net/` + `server/relay.ts` + `server/mp.ts`** - LAN multiplayer (2026-07-12). `bun run mp` starts a Bun WebSocket relay (port 5200, dumb fan-out with sender-id tagging) plus vite `--host`, so a second machine just opens the printed URL - no second clone. Activation is `?mp=1` (+ `&name=` / `&color=` - the URL is the per-machine channel because both machines share the repo's config.ts). Each client simulates only its own car; peers stream 60Hz pose packets (32-byte binary) and render on every other machine as an interpolated (80ms delay, arrival-time-stamped ring buffer) **kinematic rapier body**, so collisions genuinely shove the local dynamic car - each player's car is only ever pushed by physics on their own screen, and the result flows back through their own pose stream. `CONFIG.multiplayerRam` toggles the collider. Lap/trick stats piggyback as 2Hz JSON; the same timer doubles as the keepalive against the relay's 30s idleTimeout. **Synced races** (G / pad X → `raceSignal` in vehicleSignals.ts): everyone teleports to a deterministic grid (sorted relay ids → lateral slots), 3-2-1-GO with throttle locked, first valid lap wins (winner claim broadcast, raceId-guarded). **Crash-prop sync** (`core/propsSignal.ts`): layouts were already round-seeded, so mp flips to a shared round dealt by each race start (local resets stop re-scattering), and local bursts broadcast so both screens pop - remote pops score no points.
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
- `window.__game` / `window.__perf` / `window.__delights` - runtime dev inspection hooks

## Gotchas

- **Rapier heightfield colliders are infinitely thin** - a body descending faster than ~28m/s in one 60Hz step can tunnel straight through, and rapier CCD does not arm on it. Backstop: a catch-floor slab plus a below-terrain auto-reset.
- **`BufferGeometryUtils.mergeGeometries` returns `null` silently** when mixing indexed and non-indexed geometries (e.g. `ExtrudeGeometry` is non-indexed, `CylinderGeometry`/`BoxGeometry` are indexed) - never non-null-assert its result, check for `null` explicitly.
- **Fogging distant scenery toward a solid colour reads as a flat slab** against a gradient sky, with a hard top edge. Fix: dissolve far geometry by vertex alpha toward zero at the summit (`fog: false`) so the sky shows through, and bake the fog colour into low-altitude vertex colours to keep it visually tied to the fogged mid-ground (the "D-FOG" atmospheric bridge).
- **Two coplanar authored faces z-fight as a whole-face moire** (e.g. a roof-glass surface copied from the roof's own points). Fix with real geometric separation (a few mm drop), never `polygonOffset`.
- **Never drive a kinematic body through the declarative `<RigidBody>` component** - @react-three/rapier also feeds a kinematic body's target from its own scene-graph transform every frame, which fights your `setNextKinematicTranslation` and leaves the body trailing seconds behind (symptom: physics callback runs at 60Hz with fresh targets but `body.translation()` never matches the previous target). Create the body imperatively (`world.createRigidBody`) and pose the visual as a plain three group - see `src/net/RemoteCars.tsx`.

## Build process notes

Built via Kai-as-orchestrator + 4 long-lived Opus worker agents (world / drive / look / avui) + 2 independent fresh-context checker agents, coordinated through the Nexus cluster kanban (project 45, "Sundown Run"). Checker verdicts and working traces are in `scratchpad/checks/` (gitignored - working evidence, not durable project record). The prompt that drove the whole build is preserved at `research/fable-orchestrated-build-prompt.md`.

## Next Actions

See `open-threads.md`.
