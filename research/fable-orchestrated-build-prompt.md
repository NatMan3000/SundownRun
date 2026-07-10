---
type: reference
title: Orchestrated Fable build prompt (Sundown Run)
description: The single prompt that produced Sundown Run end-to-end via a boss/worker/checker agent team - the worked template cited by Kai's Fable operating guide and AgentTeam skill.
created: 2026-07-09
---

# Orchestrated Fable build prompt

The prompt below is what built this entire game, in one session, from a blank
repo. It is reproduced **verbatim as it was run on 2026-07-09** - at that time
the project directory was still named `CarDriveGame3d`.

It is kept as a worked template for the boss / worker / checker pattern:
constitution first, parallel long-lived workers, independent checkers that
re-execute rather than re-read.

---

I'm rebuilding a 3D driving game. The first version worked but looked like a low-poly prototype - flat colours, programmer-art trees, nothing that made you stop and look. This time I'm building it with my 12-year-old son, Josh, and he's the player. If this comes out genuinely impressive - something he's proud of and actually keeps playing - it could be the thing that tips him toward building stuff like this himself. So the bar is double: "would a stranger think this looks great" AND "would a 12-year-old keep coming back to play it."

Build it as a complete, runnable browser game into the current directory (`~/Dev/CarDriveGame3d`). Stack: Vite + React 19 + TypeScript + `@react-three/fiber` v9 + `@react-three/drei` + `@react-three/rapier` (physics), package-managed with Bun. (r3f v9 requires React 19 - pair them deliberately, don't let a dependency resolver pick.) Everything self-contained and procedural - generate geometry, materials, textures, and audio in code; do NOT depend on external model/texture/CDN URLs that can 404. No placeholders, no TODOs, no "this would be where the real asset goes." It should run with a single `bun install && bun run dev`.

Keep the original idea, raise everything else: you drive a sporty car through a scenic open natural world - a road winding through terrain, vegetation, distant mountains under an expansive sky - with a smooth third-person chase camera, engine audio that responds to speed, and satisfying crash feedback. That's the skeleton. The leap I care about is visual and tactile quality.

Done looks like:
- It genuinely looks high quality - cohesive art direction, real lighting, depth and atmosphere. Not flat, not "default Three.js scene." Someone glancing at it should assume real effort went into the look.
- Locked, smooth 60fps on an ordinary laptop while driving (instanced vegetation, sensible draw distance / LOD, no per-frame allocation).
- The drive feels good - weight, grip, suspension, throttle/brake response, a handbrake drift that's fun, a camera that breathes with speed.
- One cohesive aesthetic, committed to fully.
- It's fun for a kid, not just pretty for an adult: a few discoverable delights - jumps, drift smoke, something hidden to find, a reason to go "dad, watch this." Your choice what they are.
- Self-contained and reproducible: clean clone runs first try.

If visual quality and 60fps ever conflict, hold the 60fps and find a cheaper route to the look - smoothness is what makes it feel premium to the person holding the keys.

Run this as an orchestrated team build, not a solo marathon. You are the boss and art director: you write the standard, design the system, review the work, and rule on disputes - and you route the implementation to parallel worker sub-agents spawned on Opus (Agent tool, `model: "opus"`; never forks - a fork inherits your model and defeats the routing). Split the work along whatever seams you judge natural (terrain and vegetation, vehicle physics and input, rendering and post, audio, UI and config are the obvious candidates), keep workers long-lived rather than one-shot so their context compounds, and reserve your own hands for the constitution, the hardest glue, and final judgment.

Before the first line of game code, write the constitution: one short document in the repo covering the art direction you've chosen (palette, light, mood, and the reference class below), a hard performance budget (the 60fps line, instancing and draw-call rules, the no-per-frame-allocation rule), and a feel standard (spring-damped motion, input response, camera behaviour). Every round of work gets judged against the constitution, not against taste in the moment. If the direction genuinely evolves mid-build, update the constitution deliberately - it is the single standard every checker reads.

Every worker task ends with an independent check by a fresh-context sub-agent that did not write the code. Checkers re-execute rather than re-read: they drive the running game, take screenshots, measure frame times, read the console - and they judge against the constitution, never against the worker's report. A worker can say done; the checker decides whether that's true. Failures go back to the worker with the specific defect, not "try again," and the loop repeats until true. No rank is exempt: code you write yourself gets checked the same way, and if a checker verdict looks wrong, adjudicate the dispute against the constitution rather than quietly overruling it. Three checks matter enough to name - a visual judge that looks at actual screenshots and answers "would this frame stop someone scrolling" against the reference class, a performance check that measures frame times over a scripted demo drive rather than trusting an eyeball, and a clean-clone check near the end that clones the repo fresh, runs `bun install && bun run dev`, and confirms the game boots and plays. Beyond those, add whatever checks the build needs.

You own the art direction - pick the look you can make most beautiful (a stylised golden-hour naturalism, a moody dusk, a clean premium-stylised palette, whatever you can execute best) and commit to it cohesively rather than hedging across styles. The quality levers are yours to deploy as fits: PBR materials with real-time shadows, a post-processing stack (tone mapping, bloom, ambient occlusion, colour grading, subtle vignette and depth-of-field), sky + sun / image-based environment lighting, atmospheric fog and haze, good anti-aliasing, and richer-than-low-poly procedural geometry. Use them in service of the look - don't just stack effects.

Set your reference class correctly: the bar is the best of the three.js / react-three-fiber showcase scene - the award-site demos people share around - not a typical hobby project. You know the full bag of tricks that tier uses; deploy whatever earns its place. Hand-written GLSL is explicitly on the table where stock materials fall flat: terrain texture blending, wind-swayed instanced grass and foliage, drift smoke and dust particles, skid marks, god rays, whatever the chosen look calls for. "Good enough" is the failure mode here - if a screenshot would not make someone stop scrolling, keep iterating.

The same bar applies to motion as to stills. Nothing should judder or snap: springs and damping on everything that moves (camera, car body, HUD), fixed-timestep physics with interpolated rendering, and transitions that ease rather than jump. A beautiful frame that moves badly fails the brief.

Make the driving tactile: responsive arcade-sim handling with body roll and suspension travel, tyre grip and slip, a handbrake drift, speed-reactive camera (FOV, gentle shake, lerp follow), procedurally-synthesised engine audio whose pitch and volume track rpm/speed, and a clear impact response on collisions. A clean, minimal HUD - keep it out of the way.

Support both keyboard and gamepad - specifically a Bluetooth Xbox controller via the browser Gamepad API, with analog steering and analog triggers for throttle/brake (analog input is half of what makes driving feel good), and hot-swap between inputs with no config: whichever the player touches wins. You can't verify a physical controller from the harness, so keep that path simple and standards-based, never let it degrade keyboard play, and flag it for a human test in your final summary.

One more thing: expose the fun knobs. Put the obviously-tweakable values - car colour, handling feel, time-of-day, camera distance - in one small, well-commented config file that a 12-year-old could edit and immediately see the change. This game doubles as Josh's first codebase; make the door in easy to find.

You and your checkers have Chrome DevTools and Playwright MCP tools for driving the browser and capturing frames, and you're welcome to build dev-only verification affordances - a screenshot hotkey, a scripted camera fly-through, a deterministic demo drive - whatever makes seeing and measuring the game cheap and repeatable for the checking loop. "Looks good" can't be asserted; it has to be seen. Before reporting that something looks good, point to a screenshot from this session that shows it; if a frame looks flat or cheap, say so and send it back.

Before reporting progress on anything - visuals, framerate, physics, the clean-clone claim - audit each claim against a tool result from this session. If something fails or underperforms, say so with the output. Treat your own prior status notes, and every worker's report, as a reconstruction, not a readout.

When you have enough to act, act - don't pre-plan at length or survey options you won't use. The actions here are all reversible and follow from this request, so proceed end to end without pausing to ask permission; if you hit a genuinely ambiguous fork, state your assumption and keep going. Initialise a git repo up front and commit at each working milestone so there's always a good state to roll back to. When you're done, give me a plain final summary: what you built, exactly how to run it, the art direction you chose and why, which checks caught what along the way, and anything that's rough or that you'd polish next - in complete sentences, no shorthand.
