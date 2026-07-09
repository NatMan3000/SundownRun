# SUNDOWN RUN - Constitution

The single standard every worker and checker judges against. Disputes are settled
against this document, not against taste in the moment. Changes to it are deliberate
and committed, never drive-by.

## 1. Art direction - "Golden Hour"

End-of-summer evening drive. Warm, nostalgic, calm but fast. One cohesive look,
committed fully - no style hedging.

**Reference class:** the best of the three.js / r3f showcase scenes - award-site
demos people share. If a screenshot would not make someone stop scrolling, it fails.

**Light:** one low warm sun (elevation ~14 deg, azimuth from config time-of-day),
colour `#FFD9A8`, long soft shadows. Cool sky fill via hemisphere light
(`#7B90C4` sky / `#C9A268` warm ground bounce). Everything sits in atmosphere:
distance fades into warm haze, never hard-clips.

**Palette:**

| Element | Colours |
|---|---|
| Sky | zenith `#5B7FB4`, horizon near sun `#FFC98A` -> `#FF9E5E`, anti-sun haze `#B8A0C8` |
| Terrain grass | sun-bleached gold `#C9A85C` blended with olive `#7A8B4F` |
| Trees | deep olive `#4F6134`, sparse autumn accents `#C1663B` |
| Road | warm asphalt `#4A4440`, dusty edges `#8A7A5E`, centre line faded cream `#D8C9A8` |
| Mountains | hazy blue-violet `#7B85A8` fading up to `#A8AECB` |
| Car (default) | saturated teal-blue `#1FA8C9` - pops against warm golds; kid-changeable in config |

**Mood tests a visual checker applies to real screenshots:**
- Depth: at least three distinct depth planes readable (road/near, mid vegetation, far mountains+haze).
- Light: long shadows visible; sun direction obvious; warm/cool contrast present.
- Cohesion: nothing reads as "default Three.js" - no flat unlit colours, no pure-primary hues, no untextured monotone ground.
- Motion: nothing pops, snaps or judders - camera, car body, HUD all eased.

## 2. Performance budget - the 60fps line

60fps is held over visual quality when they conflict. Find a cheaper route to the look.

Measured on the scripted demo drive (`?demo=1`, ~30s autopilot lap segment), Apple-M-class
integrated GPU as the "ordinary laptop" baseline:

- **avg frame <= 12ms, p99 <= 16.6ms.** The demo harness records real numbers into `window.__perf`.
- Draw calls <= 300, triangles in view <= 1.5M (`window.__game.renderInfo`).
- **Instancing is mandatory** for all repeated geometry (grass, trees, rocks, posts). One InstancedMesh (or instanced shader mesh) per species, not per object.
- One shadow-casting directional light. Shadow map <= 2048, tight frustum that follows the car.
- **No per-frame allocation** in `useFrame`/physics loops: reuse module-level temp vectors/quaternions; no `new`, no array spreads, no object literals per frame. No React setState per frame - transient zustand reads/writes only.
- Fog-matched far plane and draw distance (from config). Distant world fades into haze, never pops.
- All textures procedural (canvas / DataTexture), <= 1024px per texture.
- Particles are pooled and instanced; skid marks are a capped ring buffer mesh.
- Post stack budget: SMAA + tone mapping + bloom + vignette are the base; AO / DoF / god rays only if the frame budget still holds with them on.
- Physics: static colliders only near the road corridor (terrain heightfield + large obstacles). Distant decoration gets no collider.

## 3. Feel standard

- Physics fixed at 60Hz with interpolated rendering (rapier `timeStep={1/60}`, interpolation on).
- **Springs and damping on everything that moves**: camera position/look, car body visual roll/pitch, FOV changes, HUD values. Nothing teleports except an explicit reset.
- Camera: chase with lag, FOV 55 -> 68 with speed, subtle speed shake, collision kick that damps back. Never snaps, never clips through terrain.
- Input: analog-first. Gamepad steering/triggers map through gentle response curves; keyboard steering is attack/release smoothed so digital input doesn't twitch. Whichever device the player touched last wins, no config.
- Handling: arcade-sim - weight, tyre grip and slip, visible suspension travel and body roll, handbrake kicks the rear loose into a catchable drift. Fun beats realism, but momentum must feel honest.
- Crashes: clear impact response - audio thump, camera kick, particle burst - and the car stays playable. R resets to the road.

## 4. Verification protocol

- A worker saying "done" means nothing until a fresh-context checker that did not write
  the code re-executes: boots the game, drives it (or runs `?demo=1`), screenshots,
  reads the console, measures frames - and judges against THIS document.
- Named checks: **visual judge** (screenshots vs the reference class and the mood tests
  above), **performance check** (demo-drive numbers vs section 2), **clean-clone check**
  (fresh clone, `bun install && bun run dev`, boots and plays first try).
- Every progress claim must point at a tool result from this session - a screenshot, a
  perf readout, a console log. Reports without evidence are reconstructions, not readouts.
- Failures go back to the owning worker with the specific defect.

## 5. Hard rules

- The world physically contains the player: no reachable route lets the car leave the map, clip through boundary geometry, or fall off. Boundaries read as natural (mountains, rock), never as an invisible wall hit at speed without visual cause.
- Interactable objects behave consistently: if one tree collides, every reachable tree collides - and a tree hit fast enough smashes away rather than bricking the car.
- Self-contained: no external model/texture/font/CDN URLs. Everything procedural or committed.
- `bun install && bun run dev` on a clean clone is the entire setup.
- Kid door: the fun knobs (car colour, handling feel, time-of-day, camera, delights)
  live in ONE well-commented file: `src/core/config.ts`. A 12-year-old edits a value,
  saves, and sees the change immediately.
- Dev server: port 5199 (strict). Workers do not squat the port - checkers and the
  orchestrator own the running instance.
- No new dependencies without orchestrator approval.
