// All HUD styling lives here as one injected stylesheet - src/styles.css belongs
// to the scaffold and is not ours to edit. Palette: cream #F2E8D5 text, amber
// #FFB35C accents, warm-dark translucent panels. Nothing pops: every entrance
// and exit is eased over 150-300ms.

export const HUD_CSS = `
.hud-root {
  position: fixed;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  color: var(--hud-cream, #F2E8D5);
  font-family: var(--hud-font);
  -webkit-font-smoothing: antialiased;
  --amber: var(--hud-amber, #FFB35C);
  --amber-dim: #D6994F;
  --panel: rgba(26, 20, 16, 0.42);
  --edge: rgba(255, 179, 92, 0.16);
}

.hud-panel {
  background: var(--panel);
  border: 1px solid var(--edge);
  border-radius: 12px;
  backdrop-filter: blur(7px) saturate(1.1);
  -webkit-backdrop-filter: blur(7px) saturate(1.1);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
}

/* While the title card is up the HUD stands down, then eases in behind it.
   IntroCard owns the html[data-intro] attribute. */
.hud-lap, .hud-shards, .hud-speed, .hud-hint, .trick-board { transition: opacity 300ms ease; }
html[data-intro] .hud-lap,
html[data-intro] .hud-shards,
html[data-intro] .hud-speed,
html[data-intro] .hud-hint,
html[data-intro] .trick-board { opacity: 0; }

/* ---------------- lap panel (top-left) ---------------- */

.hud-lap {
  position: absolute;
  top: 16px;
  left: 16px;
  min-width: 178px;
  padding: 11px 15px 12px;
}
/* the dev fps meter squats at top-left; step down out of its way */
.hud-lap--fps { top: 44px; }

.hud-lap__label {
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  opacity: 0.55;
}
.hud-lap__clockrow {
  display: flex;
  align-items: baseline;
  gap: 8px;
  white-space: nowrap;
}
.hud-lap__clock {
  font-size: 27px;
  font-weight: 300;
  line-height: 1.18;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  transition: color 220ms ease;
}
/* the lap in progress has gone off-road: it still counts, it just cannot win */
.hud-lap__clock--dirty { color: var(--amber-dim); }

/* ---------------- off-road tag ---------------- */

.hud-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 5px;
  border: 1px solid rgba(255, 179, 92, 0.38);
  background: rgba(255, 179, 92, 0.1);
  color: var(--amber);
  font-size: 9px;
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  /* always mounted, so the panel never resizes underneath the numbers */
  opacity: 0;
  transform: translateY(-3px) scale(0.94);
  transition: opacity 200ms ease, transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1);
}
.hud-tag--on { opacity: 1; transform: none; }
.hud-tag--mini {
  margin-left: 6px;
  padding: 1px 5px;
  font-size: 8px;
  letter-spacing: 0.12em;
}
.hud-lap__rows {
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px solid rgba(242, 232, 213, 0.1);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.hud-lap__row {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  font-size: 11px;
  letter-spacing: 0.13em;
}
.hud-lap__row span { opacity: 0.5; }
.hud-lap__row b {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  font-size: 12px;
  /* '-:--.---' and '1:30.000' are both 8 chars but only digits are tabular,
     so pin the column or the panel jumps the first time a lap completes */
  min-width: 8ch;
  text-align: right;
}
.hud-lap__row b.amber { color: var(--amber); }
.hud-lap__row b.dirty { color: var(--amber-dim); }

/* ---------------- shard counter (top-right) ---------------- */

.hud-shards {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 9px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  animation: shardPop 420ms cubic-bezier(0.2, 1.5, 0.4, 1);
  transform-origin: 100% 0%;
}
@keyframes shardPop {
  0%   { transform: scale(1); }
  28%  { transform: scale(1.13); }
  100% { transform: scale(1); }
}
.hud-shards__gem {
  width: 13px;
  height: 13px;
  transform: rotate(45deg);
  border-radius: 2px;
  background: linear-gradient(135deg, #FFE7C2, var(--amber));
  box-shadow: 0 0 10px rgba(255, 179, 92, 0.6);
}
.hud-shards__count {
  font-size: 16px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.hud-shards__count i { font-style: normal; opacity: 0.42; }
.hud-shards__label {
  font-size: 10px;
  letter-spacing: 0.19em;
  text-transform: uppercase;
  opacity: 0.5;
}

/* ---------------- speed (bottom-right) ---------------- */

.hud-speed {
  position: absolute;
  right: 28px;
  bottom: 22px;
  display: flex;
  align-items: flex-end;
  gap: 11px;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.45);
}
.hud-gear {
  margin-bottom: 13px;
  padding: 3px 9px;
  border-radius: 7px;
  border: 1px solid rgba(255, 179, 92, 0.35);
  background: rgba(26, 20, 16, 0.34);
  color: var(--amber);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums;
}
.hud-speed__num {
  font-size: 78px;
  font-weight: 200;
  line-height: 0.82;
  letter-spacing: -0.035em;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  min-width: 2.2ch;
  text-align: right;
}
.hud-speed__unit {
  margin-bottom: 9px;
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  opacity: 0.55;
}

/* ---------------- toast (centre) ---------------- */

.hud-toast {
  position: absolute;
  left: 50%;
  bottom: 24%;
  padding: 9px 22px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  white-space: nowrap;
  background: var(--panel);
  border: 1px solid var(--edge);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  animation:
    toastIn 240ms cubic-bezier(0.2, 1.2, 0.35, 1) both,
    toastOut 260ms ease-in 1440ms forwards;
}
.hud-toast--gold {
  color: #241503;
  background: linear-gradient(180deg, #FFE0B0, var(--amber));
  border-color: rgba(255, 220, 170, 0.7);
  box-shadow: 0 6px 30px rgba(255, 160, 60, 0.35);
}
/* a note, not a telling-off */
.hud-toast--void {
  color: var(--amber);
  border-color: rgba(255, 179, 92, 0.34);
}
@keyframes toastIn {
  from { opacity: 0; transform: translate(-50%, 12px) scale(0.94); }
  to   { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
@keyframes toastOut {
  from { opacity: 1; transform: translate(-50%, 0) scale(1); }
  to   { opacity: 0; transform: translate(-50%, -10px) scale(0.98); }
}

/* ---------------- controls hint (bottom-centre) ---------------- */

.hud-hint {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 22px;
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 11px;
  letter-spacing: 0.1em;
  opacity: 0.6;
  transition: opacity 300ms ease;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
}
.hud-hint--gone { opacity: 0; }
.hud-key {
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid rgba(242, 232, 213, 0.28);
  background: rgba(26, 20, 16, 0.4);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.hud-hint em { font-style: normal; opacity: 0.6; }

/* ---------------- intro title card ---------------- */

.intro {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  cursor: pointer;
  pointer-events: auto;
  /* light enough that the golden hour still reads behind the type */
  background:
    radial-gradient(135% 100% at 50% 60%, rgba(78, 38, 14, 0.26) 0%, rgba(20, 13, 16, 0.7) 54%, rgba(8, 6, 10, 0.9) 100%);
  backdrop-filter: blur(2px) saturate(0.95);
  -webkit-backdrop-filter: blur(2px) saturate(0.95);
  opacity: 1;
  transition: opacity 300ms ease, backdrop-filter 300ms ease;
}
.intro--out {
  opacity: 0;
  pointer-events: none;
  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
}

.intro__inner {
  position: relative;
  text-align: center;
  padding: 0 24px;
  animation: introRise 620ms cubic-bezier(0.16, 0.9, 0.24, 1) both;
}

/* Localized scrim, anchored to the text block so it follows the copy rather
   than a guessed pixel box. Gradients only - no backdrop-filter, because .intro
   already has one and that makes it a backdrop root, which would render a
   nested backdrop-filter silently inert.
   The negative inset gives the falloff room to reach zero well outside the
   text, so no edge is ever visible against the scene. The second stop sits over
   the instruction rows (lower half of the block), where the sun flares off the
   car roof and washed the gamepad line out. */
.intro__inner::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: -48% -13%;
  pointer-events: none;
  background:
    radial-gradient(50% 22% at 50% 68%,
      rgba(4, 3, 6, 0.42) 0%, rgba(4, 3, 6, 0.30) 48%, rgba(4, 3, 6, 0.10) 78%, rgba(4, 3, 6, 0) 100%),
    radial-gradient(closest-side ellipse at 50% 50%,
      rgba(4, 3, 6, 0.50) 0%, rgba(4, 3, 6, 0.44) 34%, rgba(4, 3, 6, 0.26) 60%, rgba(4, 3, 6, 0.08) 82%, rgba(4, 3, 6, 0) 100%);
}
@keyframes introRise {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
}

.intro__title {
  margin: 0;
  font-size: clamp(42px, 8.6vw, 118px);
  font-weight: 200;
  letter-spacing: 0.2em;
  margin-right: -0.2em;
  line-height: 1;
  background: linear-gradient(178deg, #FFF6E4 6%, #FFC98A 46%, #FF9E5E 76%, #E0743A 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 6px 34px rgba(255, 140, 60, 0.28));
}
.intro__rule {
  width: 120px;
  height: 1px;
  margin: 26px auto 20px;
  background: linear-gradient(90deg, transparent, rgba(255, 179, 92, 0.75), transparent);
}
.intro__kicker {
  font-size: 12px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: #F2E8D5;
  opacity: 0.74;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.8);
}
.intro__controls {
  margin-top: 30px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px 22px;
  font-size: 11px;
  letter-spacing: 0.09em;
  color: #F2E8D5;
  opacity: 0.88;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.85);
}
.intro__controls > span { display: flex; align-items: center; gap: 6px; }
/* was 0.38 - unreadable where the sun flares off the car body behind it */
.intro__pad {
  margin-top: 14px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #F2E8D5;
  opacity: 0.62;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.85);
}
/* ---------------- the garage ---------------- */

.intro__garage {
  margin-top: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}
.intro__chev {
  pointer-events: auto;
  cursor: pointer;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid rgba(255, 179, 92, 0.32);
  background: rgba(26, 20, 16, 0.45);
  color: var(--amber, #FFB35C);
  font-size: 19px;
  line-height: 1;
  padding-bottom: 2px;
  user-select: none;
  transition: background 180ms ease, border-color 180ms ease, transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1);
}
.intro__chev:hover {
  background: rgba(255, 179, 92, 0.16);
  border-color: rgba(255, 179, 92, 0.62);
  transform: scale(1.08);
}
.intro__chev:active { transform: scale(0.93); }

.intro__car { min-width: 250px; }
.intro__carname {
  font-size: 19px;
  font-weight: 500;
  letter-spacing: 0.2em;
  margin-right: -0.2em;
  color: #F2E8D5;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.85);
  /* keyed on the body id, so the name re-animates on every swap */
  animation: carSwap 260ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
}
@keyframes carSwap {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: none; }
}
.intro__dots {
  margin-top: 10px;
  display: flex;
  justify-content: center;
  gap: 6px;
}
.intro__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(242, 232, 213, 0.26);
  transition: background 200ms ease, transform 200ms ease;
}
.intro__dot--on {
  background: var(--amber, #FFB35C);
  transform: scale(1.3);
}

/* ---------------- steering sensitivity ---------------- */

/* same row grammar as the car selector, so the chevrons line up vertically */
.intro__garage--steer { margin-top: 20px; }

/* Same circle as the car row's chevrons, glyph rotated to point up / down.
   The rotation lives on an inner span so the circle's hover scale() and the
   glyph's rotate() do not fight over one transform property.
   '&lsaquo;' points left: rotate(-90deg) aims it down, rotate(90deg) aims it up. */
.intro__chev--vert {
  font-size: 19px;
  padding-bottom: 0;
}
.intro__chevrot {
  display: block;
  line-height: 1;
  transition: transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1);
}
.intro__chev--down .intro__chevrot { transform: rotate(-90deg); }
.intro__chev--up .intro__chevrot { transform: rotate(90deg); }

.intro__steer { min-width: 250px; }
.intro__steername {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.2em;
  margin-right: -0.2em;
  color: #F2E8D5;
  opacity: 0.82;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.85);
}
.intro__steername b {
  margin-left: 7px;
  color: var(--amber, #FFB35C);
  font-weight: 600;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}
.intro__steertrack {
  margin-top: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #F2E8D5;
}
.intro__steertrack > span {
  opacity: 0.4;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.8);
}
.intro__ticks {
  display: flex;
  align-items: center;
  gap: 5px;
}
.intro__tick {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(242, 232, 213, 0.24);
  transition: background 180ms ease, transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1);
}
.intro__tick--on {
  background: var(--amber, #FFB35C);
  transform: scale(1.75);
}

.intro__garagehint {
  margin-top: 15px;
  font-size: 10px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #F2E8D5;
  opacity: 0.44;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.8);
}

.intro__go {
  margin-top: 34px;
  font-size: 12px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--hud-amber, #FFB35C);
  text-shadow: 0 1px 14px rgba(0, 0, 0, 0.7);
  animation: introBreathe 2.4s ease-in-out infinite;
}
@keyframes introBreathe {
  0%, 100% { opacity: 0.42; }
  50%      { opacity: 1; }
}

/* ---------------- trick popups (upper centre) ---------------- */

/* column-reverse: the newest shout sits on top, so a combo climbs as it chains.
   Sits above the road's vanishing point, clear of the centre where you steer. */
.trick-pops {
  position: absolute;
  left: 50%;
  top: 29%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}
.trick-pop {
  display: flex;
  align-items: baseline;
  gap: 12px;
  white-space: nowrap;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.55);
  /* same in/hold/out grammar as the toast - spring in, drift up and fade */
  animation:
    trickIn 260ms cubic-bezier(0.15, 1.4, 0.35, 1) both,
    trickOut 300ms ease-in 1100ms forwards;
}
.trick-pop__label {
  font-size: 30px;
  background: linear-gradient(178deg, #FFF6E4 8%, #FFC98A 52%, #FF9E5E 96%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 3px 16px rgba(255, 150, 70, 0.35));
}
.trick-pop__pts {
  font-size: 20px;
  font-weight: 800;
  color: var(--amber);
  font-variant-numeric: tabular-nums;
}
/* the combo position, a hot amber pill - the chain made legible */
.trick-pop__combo {
  font-size: 21px;
  font-weight: 800;
  color: #241503;
  padding: 1px 9px;
  border-radius: 999px;
  background: linear-gradient(180deg, #FFE0B0, var(--amber));
  box-shadow: 0 3px 16px rgba(255, 160, 60, 0.4);
  font-variant-numeric: tabular-nums;
}
/* a wipeout: muted amber, no gold, no glow - a note, not a trophy */
.trick-pop--fail .trick-pop__label {
  font-size: 24px;
  background: none;
  -webkit-background-clip: border-box;
  background-clip: border-box;
  color: var(--amber-dim);
  filter: none;
}
/* deeper into a combo, and bigger tricks, shout louder */
.trick-pop--combo .trick-pop__label { font-size: 34px; }
.trick-pop--big .trick-pop__label {
  font-size: 40px;
  filter: drop-shadow(0 4px 22px rgba(255, 170, 80, 0.55));
}
@keyframes trickIn {
  from { opacity: 0; transform: translateY(16px) scale(0.86); }
  to   { opacity: 1; transform: none; }
}
@keyframes trickOut {
  from { opacity: 1; transform: none; }
  to   { opacity: 0; transform: translateY(-22px) scale(0.98); }
}

/* ---------------- trick scoreboard (bottom-left) ---------------- */

.trick-board {
  position: absolute;
  left: 16px;
  bottom: 22px;
  padding: 9px 14px;
  min-width: 152px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.trick-board__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}
.trick-board__row--best {
  margin-top: 4px;
  padding-top: 5px;
  border-top: 1px solid rgba(242, 232, 213, 0.1);
}
.trick-board__label {
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  opacity: 0.55;
}
.trick-board__val {
  font-size: 22px;
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}
.trick-board__val--best {
  font-size: 15px;
  color: var(--amber);
}

/* ---------------- multiplayer panel (under the lap panel) ---------------- */

.hud-mp {
  position: absolute;
  top: 150px;
  left: 16px;
  min-width: 178px;
  padding: 9px 15px 10px;
  transition: opacity 300ms ease;
}
html[data-intro] .hud-mp { opacity: 0; }
.hud-mp__label {
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  opacity: 0.55;
}
.hud-mp__status {
  margin-top: 5px;
  font-size: 12px;
  opacity: 0.75;
  font-style: italic;
}
.hud-mp__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 6px;
  font-size: 13px;
}
.hud-mp__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  transform: translateY(-1px);
}
.hud-mp__name {
  font-weight: 600;
  letter-spacing: 0.04em;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hud-mp__stat {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  opacity: 0.85;
}
.hud-mp__stat--score { color: var(--amber); }
`
