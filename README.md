# Sundown Run

A golden-hour open-world driving game, built for (and eventually by) Josh.

## Run it

### Windows

**1. Install Node.js.** Get the LTS installer from [nodejs.org](https://nodejs.org)
and click through it. You only ever do this once. (If you'd rather use
[Bun](https://bun.sh) it's faster, and the launcher will pick it up automatically
— but Node has the friendlier installer.)

**2. Get the game files.** Either:

- **Download the zip** — on the [GitHub page](https://github.com/NatMan3000/SundownRun),
  click the green **Code** button, then **Download ZIP**. Right-click the
  downloaded zip and choose **Extract All**.
- **Or clone it** if you have git:
  ```
  git clone https://github.com/NatMan3000/SundownRun.git
  ```
  This way `git pull` gets you the latest version whenever there's an update.

**3. Double-click `Sundown Run.bat`.**

The first run installs what it needs and takes a minute. Every run after that
starts in a few seconds. Close the black window to stop playing.

> If Windows complains that the file came from the internet, right-click
> `Sundown Run.bat`, choose **Properties**, tick **Unblock**, then OK.
> Cloning with git instead of downloading the zip avoids this entirely.

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
