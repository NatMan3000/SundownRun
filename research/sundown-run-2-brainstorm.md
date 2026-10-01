---
type: notes
title: Sundown Run Two - brainstorm and harvest from v1
description: What Sundown Run grew into after its build prompt, what flopped, the feel and tech lessons, and the decision log for the Sundown Run Two one-shot prompt (Opus 5.5)
created: 2026-10-01
status: final
---

# Sundown Run Two - brainstorm

Source material for the Sundown Run Two one-shot prompt. The prompt itself will land at `research/sundown-run-2-build-prompt.md` (kept out of `~/Dev/SundownRun2` so the new repo starts genuinely empty).

## What v1's prompt asked for vs what the game became

The 2026-07-09 prompt (`research/fable-orchestrated-build-prompt.md`) asked for: one scenic open world with a winding road, a car with good physics and a chase camera, engine audio, crash feedback, a few hidden delights, keyboard + Xbox pad, a kid knob file, 60fps.

Everything below was added afterwards, over five more sessions:

| Added later | When | Why it matters for v2 |
|---|---|---|
| Lap validity: 8 ordered sector checkpoints + dirty-lap rule (>3s off-road can't set a best) | 07-09 | Any map with laps needs this from the start, editor tracks included |
| Garage: 4 car bodies + steering sensitivity, persisted | 07-09 | Title screen and car select are core, not polish |
| Camera cycle (chase / close / bonnet), three reset tiers (R / Shift+R / Esc) | 07-09 | Core controls |
| Sealed world boundary + catch floor | 07-09 | Every map, including user-drawn ones, must be sealed |
| Smashable trees (solid below 40 km/h, smash above) | 07-09 | Consistency rule: if one collides, all collide |
| Ghost lap (race your own best) | 07-11 | Loved; recorded per track |
| Trick scoring: air tiers, spins, flips, barrel rolls, combos, wipeouts voiding the combo | 07-11 | The thing that made it a game, not a drive |
| Crash props: bales / crate towers / barrel rings that burst for points, re-scattered each round | 07-11 | Big hit with Josh |
| Bouncy rocks, big-air hills, ramps | 07-11 | Air is the fun; jumps need to be designed in, not sprinkled |
| High scores persisted | 07-11 | |
| Windows launcher `.bat`s (play, update, multiplayer, map gen) | 07-10 to 07-12 | Josh is on Windows; these were painful to get right live |
| LAN multiplayer: relay + kinematic remote cars that genuinely shove you, synced races, shared prop rounds | 07-12 | Architect from day one, not retrofitted |
| Banked corners | 07-12 | Should be automatic, especially on drawn roads |
| Shard hunt (collectibles re-scatter per round, hunt clock) | 07-12 | Free-roam goal |
| Geysers + cinder cone (volcano canon) | 07-12 | Theme-specific; replaced in v2 |
| World Map.html generated from the game code | 07-12 | In v2 the map editor and map view become one thing |
| Learn To Code.html workshop for Josh | 07-12 | Josh's door into the code |
| CALDERA FM AI radio DJ (Gemma on WebGPU, 3.1GB) | 07-14 | Built, measured frame-neutral; voice benched |

## What flopped or got removed

- Starting-gate gantries, then stone monolith gates: "weird", deleted twice.
- Sculpted rim runs (pad, chute, kicker): rebuilt three times before landing on "a big natural hill you can climb from any side, a dip, then a small mountain to launch off".
- DJ voice (TTS): engineering fine, sounded off-putting. Text-only won.
- Wind whistle: removed outright.
- Tree regrowth and a parallax mountain layer: discussed, not wanted.

## Feel lessons (each cost a round of rework)

- Steering rebuilt three times (constant-g rack, understeer fix, lateral limit 1.8g).
- Handbrake tap with hands off spun the car to backwards on its own (checker-1's blocker). A drift must self-straighten unless held.
- Braking in a turn caused oversteer spins: needed brake balance (EBD) and a `stability` knob.
- Landings: two-wheel recovery window so near-misses aren't wipeouts, but roof landings must still wipe out.
- Air control tuned up hard, then calmed (5000 to 3500 pitch / 4000 yaw).
- Engine audio must free-rev in the air (it fell silent because it tracked ground speed).
- Tricks score only at landing (a crash voids the combo); spins count by integrating angular rate, not quaternion delta (a 720 otherwise reads as 0).
- Scoring that awards a participation prize ("always CLEAN +50") felt cheap; drift scoring, side-swipes and timber taps added variety.

## Tech gotchas to hand over

- Rapier heightfield colliders are infinitely thin; fast falls tunnel and CCD won't arm. Catch floor + below-terrain auto-reset.
- Rapier heightfield index order is `iz + ix*(N+1)`; probe it before freezing the terrain API or collision rotates 90 degrees.
- `mergeGeometries` returns `null` silently on mixed indexed/non-indexed input.
- Coplanar faces z-fight; separate geometrically, never `polygonOffset`.
- Fogging distant mountains to a solid colour makes a slab; dissolve by vertex alpha and bake fog colour into low vertices.
- Never drive a kinematic body through declarative `<RigidBody>`; create it imperatively.
- NaN firewall on every value entering rapier.
- Gamepad input is not a browser gesture, so a pad-only player never unlocks WebAudio; poll for sticky user activation.
- Title-screen arrow keys must be captured so ArrowUp doesn't leak as throttle.
- Vite HMR orphans Web Workers and AudioContexts unless `import.meta.hot.dispose()` shuts them down.
- Measurement handles (`renderInfo`) belong in the frozen contracts; the post stack silently broke them.

## Josh's real setup

- Windows gaming laptop (Gigabyte G6 KF, RTX 4060, 165Hz panel). Windows hands browsers the iGPU by default: game crawled at 15fps until Edge was forced to High performance.
- PowerShell execution policy blocks `npm`/`bun` `.ps1` shims; the bats must call binaries directly.
- Hosting multiplayer needs an inbound firewall rule for the ports; it fails silently without it.
- `git clone` instructions confused a first-time user; a ZIP path or a bat-driven update is friendlier.
- Josh has his own editable second clone; the Update bat does a hard reset by design.

## Process lessons from the orchestrated build

- Frozen contracts + strict file ownership let 4 Opus workers share a repo with zero conflicts.
- Checkers re-executing on an isolated preview port caught what self-reports missed.
- Nathan's live playtesting drove more quality than the spec. Plan for it: a playable build early, reports routed to the owning worker.
- 5+ WebGL tabs plus screenshot traffic crashed Chrome; one game tab per checker.
- Keep a `TASKS.md` checklist so the plan survives context summarising; never stop for context.
- Keep the dev server running for Nathan from the first runnable build.

## Decision log

| Code | Question | Recommendation | Decided (2026-10-01) |
|---|---|---|---|
| D1 | Theme | Sundown identity, different places | ✅ Futuristic neon (flavour: D9) |
| D2 | Maps at launch | 3 + editor | ✅ 2: one fun track, one oval with banked curves whose angle is adjustable (speed testing). Foundations must make a new track easy for Kai to author and swap in |
| D3 | Road drawing | Top-down pencil, auto smooth/bank/flatten/close, test drive, place props | ✅ Yes |
| D4 | Multiplayer | LAN from day one | ✅ Yes, reuse the proven v1 setup |
| D5 | AI radio DJ | Leave out | ✅ On hold |
| D6 | Josh's extras | Knob file, map folds into editor, Learn To Code at end | ✅ Yes, plus many knobs exposed in an in-game settings menu (sliders etc.) |
| D7 | New ideas | Josh picks | ✅ Night driving with headlights, loops and wall rides, boost pads, AI racers when solo, new modes (stunt score attack, multiplayer tag) |
| D8 | Build day | Windows + pad, live playtest | ✅ Yes; build the v1 lessons and proven v1 code in (v1 repo is a reference to lift from) |

## Round 2 brainstorm

| Code | Question | Recommendation | Decided |
|---|---|---|---|
| D9 | Neon flavour | Synthwave sunset turning to night (keeps "Sundown"), with Tron light-trails | ✅ All of the neon theme ideas below |
| D10 | Wheels or hover | Wheels (proven physics) with mag-grip on loops and wall rides | ✅ Wheels |
| D11 | Music | Procedural synthwave soundtrack that reacts to speed and boost | ✅ Yes |
| D12 | AI racers | 3-5 racers, difficulty slider, gentle catch-up, work on any track incl. drawn ones; not in multiplayer | ✅ Yes, racer count selectable 0 to 5 |
| D13 | Track files | Every track is one JSON file in `tracks/`, documented format; export/import in-game | ✅ Yes |
| D14 | Settings menu | In-game settings for car, handling, camera, audio, graphics quality; config.ts holds the defaults | ✅ Yes |
| D15 | Pause the build for constitution sign-off | No pause; the prompt fixes the non-negotiables | ✅ No pause, prompt left as is |

## Neon theme ideas

- Sky: giant striped synthwave sun sinking on the horizon, magenta to deep violet gradient, stars and a big ringed planet coming out as it gets dark, distant megacity skyline with lit windows.
- Ground: dark glossy terrain with a glowing grid, wet-look reflective road, light-strip road edges, glowing lane lines, chevrons that pulse on corners.
- Car: Tron light-trails (replace drift smoke), underglow, emissive livery strips, real headlight cones once night falls, tail-light streaks.
- Track furniture: boost pads as glowing arrows, loops as light rings, wall rides as half-pipe tubes, holographic billboards.
- Crash props: neon crates and energy cubes that shatter into glowing shards; collectibles become energy cores.
- Effects: bloom is the whole look (budget it), chromatic aberration and FOV kick on boost, speed lines.
- Oval: "the Hyperdrome", an enclosed neon stadium, bank angle on a slider, speed trap readout on the straight.
- Fun track: open neon world you can leave the road in, with the big-air hill, jumps, loops and the collectible hunt.

## Architecture call from D2/D3/D7

The road is its own 3D ribbon mesh collider (a spline with a bank/roll value per point), separate from the terrain heightfield. That one choice gives: adjustable banking (the oval's slider), loops and wall rides (a heightfield can't do overhangs), bridges and crossovers on drawn tracks, and a racing line the AI can follow on any track.
