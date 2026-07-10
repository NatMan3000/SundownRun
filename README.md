# Sundown Run

A golden-hour open-world driving game, built for (and eventually by) Josh.

## Run it

### Windows

Double-click **`Sundown Run.bat`**.

It finds Bun or Node, installs what it needs the first time, starts the game and
opens your browser. Close the black window to stop playing.

If it tells you nothing is installed, grab [Bun](https://bun.sh) (faster) or
[Node.js LTS](https://nodejs.org), then double-click the file again.

### Mac / Linux

```bash
bun install
bun run dev
```

Open http://localhost:5199

### Build a static copy

```bash
bun run build     # outputs to dist/
```

## Controls

| Action | Keyboard | Xbox controller |
|--------|----------|-----------------|
| Steer | A / D or arrows | Left stick |
| Throttle | W or up | Right trigger |
| Brake / reverse | S or down | Left trigger |
| Handbrake (drift!) | Space | A button |
| Camera view (chase / close / bonnet) | C | RB |
| Reset to road | R | Y button |
| Restart at the start line | Shift+R | View button |
| Back to menu | Esc | Menu button |

On the title screen: left/right arrows pick your car (four bodies), up/down set
steering sensitivity. Both stick between sessions.

Plug in a Bluetooth Xbox controller and touch any input - the game switches to it
automatically. Touch the keyboard to switch back.

## Josh: this bit is for you

Open `src/core/config.ts`. Every number in there is a knob - car colour, engine
power, grip, camera, time of day. Change one, save, and the game updates in the
browser instantly. Start with `carColor`.

## For developers

- `CONSTITUTION.md` - the art direction, performance budget, and feel standard
  everything is judged against.
- `?demo=1` on the URL runs a scripted autopilot lap segment and records frame
  times into `window.__perf` (used by the performance checks).
