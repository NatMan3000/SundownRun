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

#### If it runs slow on a gaming laptop

Windows hands browsers the power-saving integrated GPU by default, not your
graphics card. A machine that should run this at hundreds of frames per second
will crawl along at fifteen.

Fix it in **Settings → System → Display → Graphics**: find your browser, click
**Options**, choose **High performance**, then fully quit and reopen it. Keep
the laptop plugged in — on battery the graphics card gets parked anyway.

To check which card you actually got, press F12 and paste this into the console:

```js
const gl = document.createElement('canvas').getContext('webgl2')
gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)
```

It should name your graphics card. If it says Intel or AMD Radeon Graphics on a
machine that has a separate card, that's the problem.

To watch your frame rate while you play, set `showFps: true` in
`src/core/config.ts` and save.

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
| Start a race (multiplayer only) | G | X button |
| Camera view (chase / close / bonnet) | C | RB |
| Reset to road | R | Y button |
| Restart at the start line | Shift+R | View button |
| Back to menu | Esc | Menu button |

On the title screen: left/right arrows pick your car (four bodies), up/down set
steering sensitivity. Both stick between sessions.

Plug in a Bluetooth Xbox controller and touch any input - the game switches to it
automatically. Touch the keyboard to switch back.

## Multiplayer - race a mate on two computers

ONE computer is the "host" (everyone needs to be on the same wifi):

- **Windows:** double-click **`Sundown Run Multiplayer.bat`**. First time it asks for an
  admin YES - that adds the Windows Firewall rule that lets friends connect
  (without it Windows silently blocks them). Don't type `npm run mp` or
  `bun run mp` into PowerShell - PowerShell blocks script shims with a
  "running scripts is disabled" error; the bat file is the way.
- **Mac / Linux:** `bun run mp` in a terminal. If the Mac firewall is on,
  click "Allow" when it asks about incoming connections for bun.

It prints two links. Open the first on the host, the second on every other
computer - those need NOTHING installed, the game streams straight from
the host. Change `name=` in the link to your own name (that's your name tag)
and add `&color=red` (or any colour) so the cars look different.

You can genuinely SMASH into each other. Ramming your mate off a jump is the
whole point. If you'd rather drive through each other like ghosts, set
`multiplayerRam: false` in the knob file. More than two players works too -
every extra person who opens the link joins the same world.

**Press G (or X on a controller) to start a RACE**: everyone teleports to the
start line side by side, gets a 3-2-1 countdown (engines locked - no jump
starts), and the first one back around the track wins. Cutting across the
grass doesn't count, same as lap records. Every race also deals a fresh
layout of hay bales, crates and barrels - and when your mate smashes one,
you see it burst on your screen too.

## Josh: this bit is for you

Open `src/core/config.ts`. Every number in there is a knob - car colour, engine
power, grip, camera, time of day. Change one, save, and the game updates in the
browser instantly. Start with `carColor`.

**Explore the world from above:** double-click **`World Map.html`**. It shows
the whole 2 km world - every jump, banked corner, playground toy and sun shard
(even the hidden ones... spoilers) - and clicking anything tells you which bit
of code makes it. The map is generated FROM the game code, so after you change
the world, double-click **`Sundown Run Map Gen.bat`** (or `bun run map`) and it
rebuilds and opens the fresh map.

**Want to learn how the code actually works?** Double-click
**`Learn To Code.html`** - ten chapters that teach real programming using YOUR
game as the textbook. Every chapter has a mini-game you edit right there in the
page (build terrain, plant forests, tune gravity), and it ends with real
missions in the real game files. Chapter 7 tells you the deepest secret of
every game ever made.

**Reset your records:** press F12 in the game, click Console, type
`localStorage.clear()` and press Enter, then refresh. High score, best lap,
best combo and the ghost all start fresh (your car choice resets too).

### Your own version of the game

You can have TWO copies of the game on your computer:

- **`SundownRun`** - the official one. Run `Sundown Run Update.bat` in here to get the
  newest jumps and features. Don't build stuff in this one - updates replace it.
- **`SundownRun-Josh`** - YOURS. Change any file you like, break anything you
  like. The official copy is never touched, so the game always still works.

To make your copy, open a command window where SundownRun lives and run:

```
git clone https://github.com/NatMan3000/SundownRun.git SundownRun-Josh
```

Inside your copy, `Sundown Run.bat` starts YOUR version (close the other game
window first - they share the same door). And if your code goes properly bad
and you want a do-over, run `Sundown Run Update.bat` inside YOUR folder - it resets
your copy back to a perfect fresh version of the official game, including
removing any new files you added. (It deletes your changes, so it is the big
red do-over button, not a save button.)

Worst case - if the folder is SO broken even that doesn't work - just delete
`SundownRun-Josh` entirely and run the `git clone` line above again. The
official copy and the online version are never affected by anything you do
in your folder.

## For developers

- `CONSTITUTION.md` - the art direction, performance budget, and feel standard
  everything is judged against.
- `?demo=1` on the URL runs a scripted autopilot lap segment and records frame
  times into `window.__perf` (used by the performance checks).
