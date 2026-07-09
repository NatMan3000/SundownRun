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
.hud-lap, .hud-shards, .hud-speed, .hud-hint { transition: opacity 300ms ease; }
html[data-intro] .hud-lap,
html[data-intro] .hud-shards,
html[data-intro] .hud-speed,
html[data-intro] .hud-hint { opacity: 0; }

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
.hud-lap__clock {
  font-size: 27px;
  font-weight: 300;
  line-height: 1.18;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
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
}
.hud-lap__row b.amber { color: var(--amber); }

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

/* Scrim and text share one grid cell so the scrim sits directly behind the copy.
   Gradients only, no backdrop-filter: .intro already has one, which makes it a
   backdrop root, so a nested backdrop-filter would silently do nothing. */
.intro__scrim,
.intro__inner { grid-area: 1 / 1; }

.intro__scrim {
  width: min(1180px, 96vw);
  height: min(720px, 90vh);
  pointer-events: none;
  /* Heavier under the instruction lines (the sun flares off the car right
     there), lighter over the title, feathered to nothing well inside the box
     so no edge is ever visible against the scene. */
  background:
    radial-gradient(62% 30% at 50% 76%,
      rgba(4, 3, 6, 0.50) 0%, rgba(4, 3, 6, 0.36) 45%, rgba(4, 3, 6, 0.08) 78%, rgba(4, 3, 6, 0) 100%),
    radial-gradient(76% 62% at 50% 50%,
      rgba(4, 3, 6, 0.34) 0%, rgba(4, 3, 6, 0.24) 50%, rgba(4, 3, 6, 0.06) 80%, rgba(4, 3, 6, 0) 100%);
}

.intro__inner {
  position: relative;
  text-align: center;
  padding: 0 24px;
  animation: introRise 620ms cubic-bezier(0.16, 0.9, 0.24, 1) both;
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
.intro__go {
  margin-top: 40px;
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
`
