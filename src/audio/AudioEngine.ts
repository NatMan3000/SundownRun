// ============================================================
//  SUNDOWN RUN - PROCEDURAL AUDIO
// ------------------------------------------------------------
//  Every sound in this game is synthesised. There are no audio
//  files, no samples, nothing to download.
//
//  THE GRAPH
//
//    freqBus (DC) ─┬─ x0.5 ─→ sub.frequency      (sine,   weight)
//                  ├────────→ sawA.frequency     (saw,    body)
//                  ├────────→ sawB.frequency     (saw +13c, beating)
//                  ├─ x2.0 ─→ harm.frequency     (square, bite)
//                  └─ x2.6 ─→ intakeBp.frequency (noise,  induction)
//
//    [sub sawA sawB harm intake] → oscMix → lowpass → waveshaper → engineGain ┐
//    noiseA → skidBp → skidHp → skidGain ───────────────────────────────────┤
//    noiseB → roadLp → roadGain ────────────────────────────────────────────┤
//    one-shot voices → sfxBus ──────────────────────────────────────────────┤
//                                                                            ↓
//                                             master → compressor → speakers
//
//  A single ConstantSourceNode ("freqBus") is wired into every oscillator's
//  frequency AudioParam, each through a fixed gain that sets its harmonic
//  ratio. Moving one number moves the whole engine, and the layers can never
//  drift out of tune with each other. Every continuous parameter is driven with
//  setTargetAtTime, never .value, so nothing zippers.
//
//  Autoplay: nothing exists until the first user gesture. installGestureUnlock()
//  builds the context on the first keydown / pointerdown / touchstart.
// ============================================================

import { telemetry } from '../core/telemetry'
import { clamp, clamp01, makeNoiseBuffer, makeWarmthCurve, smoothstep } from './synth'

// ---------- voicing constants (tuned by ear in the browser) ----------

const MASTER_VOL = 0.8

/** Fundamental sweep: a docile 78Hz burble at idle up to a 415Hz snarl on the limiter. */
const IDLE_HZ = 78
const REDLINE_HZ = 415
/** Matches vehicle/tuning RPM.idle - telemetry.rpm never goes below this. */
const RPM_IDLE = 0.1

/**
 * Free-rev while airborne. Wheels off the ground means no load, so the engine
 * chases the limiter on throttle and settles back toward idle off it - nothing to
 * do with ground speed. Per-second approach rates: eager up, a touch calmer down.
 */
const AIR_REV_UP = 3.4
const AIR_REV_DOWN = 2.2

/** Combo chime steps, semitones above G5. Major pentatonic + the octave. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 24]
const G5 = 783.99
const C5 = 523.25
const E5 = 659.26

const IMPACT_DEBOUNCE_S = 0.11

interface Graph {
  ctx: AudioContext
  master: GainNode
  sfx: GainNode
  noise: AudioBuffer
  // engine
  freqBus: ConstantSourceNode
  lp: BiquadFilterNode
  engineGain: GainNode
  harmGain: GainNode
  intakeGain: GainNode
  // beds
  skidBp: BiquadFilterNode
  skidGain: GainNode
  roadLp: BiquadFilterNode
  roadGain: GainNode
  sources: AudioScheduledSourceNode[]
}

let G: Graph | null = null
let hidden = false
let suspendTimer: ReturnType<typeof setTimeout> | null = null

// airborne free-rev: the unloaded engine level, integrated off the audio clock
// since update() is not handed a frame delta.
let airRevN = 0
let lastUpdateT = -1

// impact edge detector
let prevImpact = 0
let lastImpactAt = -1

// deterministic noise-burst offsets (never Math.random)
let burstIndex = 0
function burstOffset(): number {
  burstIndex = (burstIndex + 1) % 97
  return (burstIndex * 0.137) % 1.7
}

// ---------- debug surface (window.__audio) ----------

const dbg = {
  contextState: 'none' as string,
  running: false,
  /** what update() asked for this frame */
  targetHz: IDLE_HZ,
  targetCutoffHz: 0,
  /** what the audio thread is actually playing right now */
  fundamentalHz: 0,
  cutoffHz: 0,
  masterGain: 0,
  engineGain: 0,
  skidGain: 0,
  roadGain: 0,
  // mirrored telemetry, so a probe sees input and output in one snapshot
  rpm: 0,
  throttle: 0,
  slip: 0,
  speedKmh: 0,
  gear: 1,
  // one-shots fired since load - lets a checker prove a sound happened
  impacts: 0,
  chimes: 0,
  laps: 0,
  landings: 0,
  voids: 0,
  selects: 0,
  tricks: 0,
}

export type AudioDebug = typeof dbg

/**
 * A COPY, deliberately. `dbg` is a long-lived mutable singleton; handing it out
 * directly means a probe that stashes `const before = snapshot()` is holding a
 * live reference and every later diff reads zero.
 */
export function debug(): AudioDebug {
  dbg.contextState = G ? G.ctx.state : 'none'
  dbg.running = isRunning()
  if (G) {
    dbg.fundamentalHz = G.freqBus.offset.value
    dbg.cutoffHz = G.lp.frequency.value
    dbg.masterGain = G.master.gain.value
    dbg.engineGain = G.engineGain.gain.value
    dbg.skidGain = G.skidGain.gain.value
    dbg.roadGain = G.roadGain.gain.value
  }
  return { ...dbg }
}

// ---------- lifecycle ----------

function build(): Graph {
  const Ctor: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctor({ latencyHint: 'interactive' })
  const t0 = ctx.currentTime
  const sources: AudioScheduledSourceNode[] = []

  // Catches the fanfare stacking on top of a redlining engine. Gentle: it is a
  // safety net, not a sound.
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 14
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.2
  comp.connect(ctx.destination)

  const master = ctx.createGain()
  master.gain.value = 0
  master.gain.setTargetAtTime(MASTER_VOL, t0, 0.09) // fade in - no start-up click
  master.connect(comp)

  const sfx = ctx.createGain()
  sfx.gain.value = 1
  sfx.connect(master)

  // ---------- the frequency bus ----------
  const freqBus = ctx.createConstantSource()
  freqBus.offset.value = IDLE_HZ
  sources.push(freqBus)

  const oscMix = ctx.createGain()
  oscMix.gain.value = 1

  /** osc.frequency has an intrinsic value of 0; the bus supplies all of it. */
  const wire = (param: AudioParam, ratio: number) => {
    if (ratio === 1) {
      freqBus.connect(param)
      return
    }
    const g = ctx.createGain()
    g.gain.value = ratio
    freqBus.connect(g)
    g.connect(param)
  }

  const layer = (type: OscillatorType, ratio: number, gain: number, detuneCents = 0) => {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = 0
    osc.detune.value = detuneCents
    wire(osc.frequency, ratio)
    const g = ctx.createGain()
    g.gain.value = gain
    osc.connect(g)
    g.connect(oscMix)
    sources.push(osc)
    return g
  }

  layer('sine', 0.5, 0.3) //             sub-octave: the weight you feel
  layer('sawtooth', 1, 0.4) //           the body of the note
  layer('sawtooth', 1, 0.28, 13) //      +13 cents: two saws beating = engine roughness
  const harmGain = layer('square', 2, 0.04) // second harmonic, opens up under load

  // ---------- induction noise ----------
  const noise = makeNoiseBuffer(ctx)
  const noiseA = ctx.createBufferSource()
  noiseA.buffer = noise
  noiseA.loop = true
  sources.push(noiseA)
  const noiseB = ctx.createBufferSource()
  noiseB.buffer = noise
  noiseB.loop = true
  sources.push(noiseB)

  const intakeBp = ctx.createBiquadFilter()
  intakeBp.type = 'bandpass'
  intakeBp.frequency.value = 0
  intakeBp.Q.value = 0.9
  wire(intakeBp.frequency, 2.6) // sits an octave-and-a-fifth above the fundamental
  const intakeGain = ctx.createGain()
  intakeGain.gain.value = 0.02
  noiseA.connect(intakeBp)
  intakeBp.connect(intakeGain)
  intakeGain.connect(oscMix)

  // ---------- engine tone stage ----------
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 420
  lp.Q.value = 0.8

  const shaper = ctx.createWaveShaper()
  shaper.curve = makeWarmthCurve(1.7)
  shaper.oversample = '2x'

  const engineGain = ctx.createGain()
  engineGain.gain.value = 0

  oscMix.connect(lp)
  lp.connect(shaper)
  shaper.connect(engineGain)
  engineGain.connect(master)

  // ---------- skid: bandpassed noise, gated by tyre slip ----------
  const skidBp = ctx.createBiquadFilter()
  skidBp.type = 'bandpass'
  skidBp.frequency.value = 900
  skidBp.Q.value = 3.2
  const skidHp = ctx.createBiquadFilter()
  skidHp.type = 'highpass'
  skidHp.frequency.value = 380 // keeps the squeal thin, off the engine's turf
  const skidGain = ctx.createGain()
  skidGain.gain.value = 0
  noiseA.connect(skidBp)
  skidBp.connect(skidHp)
  skidHp.connect(skidGain)
  skidGain.connect(master)

  // ---------- road: low rumble, dies in the air, roughens off-road ----------
  const roadLp = ctx.createBiquadFilter()
  roadLp.type = 'lowpass'
  roadLp.frequency.value = 230
  roadLp.Q.value = 0.9
  const roadGain = ctx.createGain()
  roadGain.gain.value = 0
  noiseB.connect(roadLp)
  roadLp.connect(roadGain)
  roadGain.connect(master)

  freqBus.start(t0)
  for (const s of sources) if (s !== freqBus && s !== noiseB) s.start(t0)
  noiseB.start(t0, 0.73) // offset so the two beds are not the same noise twice

  return {
    ctx,
    master,
    sfx,
    noise,
    freqBus,
    lp,
    engineGain,
    harmGain,
    intakeGain,
    skidBp,
    skidGain,
    roadLp,
    roadGain,
    sources,
  }
}

/** Create (or resume) the context. Must be called from a user gesture. */
export function ensureStarted(): void {
  if (!G) {
    try {
      G = build()
    } catch (err) {
      console.warn('[audio] could not start:', err)
      return
    }
  }
  if (G.ctx.state !== 'running') void G.ctx.resume()
}

export function isRunning(): boolean {
  return !!G && G.ctx.state === 'running'
}

/**
 * Sticky activation: has the user interacted with THIS document even once since
 * it loaded. A gamepad button is not itself a user gesture, but once any real
 * gesture (a single click, tap or keypress, ever) has landed, the browser keeps
 * that activation for the page's whole life and will allow a resume() from any
 * context after it. Missing API (old browser) reads as not-yet-activated, so a
 * pad-only session never trips an "AudioContext was not allowed to start" warning.
 */
function hasBeenActivated(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  return ua ? ua.hasBeenActive : false
}

/**
 * Arms the first user gesture, then keeps the audio alive for a pad-only player.
 *
 * The DOM listeners are the whole autoplay policy for keyboard / mouse / touch.
 * But a gamepad button raises no DOM event and does not count as a user gesture,
 * so a player who restarts (View / Shift+R keeps the same document) or drives on
 * the pad alone would never re-arm audio through those listeners. So we also poll
 * the pad: once the document already holds sticky activation - which it does the
 * moment any single gesture has landed this page-life - a button press is allowed
 * to wake the context. That is what makes sound survive a gamepad-driven restart
 * with no keyboard in reach. One context per document: ensureStarted() only ever
 * resumes an existing graph, it never rebuilds one that is already there.
 */
export function installGestureUnlock(): () => void {
  const opts: AddEventListenerOptions = { passive: true, capture: true }
  let padTimer: ReturnType<typeof setInterval> | null = null

  function remove() {
    window.removeEventListener('keydown', kick, opts)
    window.removeEventListener('pointerdown', kick, opts)
    window.removeEventListener('touchstart', kick, opts)
    if (padTimer !== null) {
      clearInterval(padTimer)
      padTimer = null
    }
  }
  function kick() {
    ensureStarted()
    if (isRunning()) remove()
  }
  function pollPad() {
    // Never attempt before a real gesture: without sticky activation resume() is
    // refused and only logs a warning. A pad press alone cannot supply it.
    if (!hasBeenActivated()) return
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i]
      if (!p || !p.connected) continue
      for (let b = 0; b < p.buttons.length; b++) {
        if (p.buttons[b]?.pressed) {
          kick()
          return
        }
      }
    }
  }

  window.addEventListener('keydown', kick, opts)
  window.addEventListener('pointerdown', kick, opts)
  window.addEventListener('touchstart', kick, opts)
  padTimer = setInterval(pollPad, 120)
  return remove
}

/** A backgrounded tab must not scream. Ramp to silence, then park the context. */
export function setHidden(next: boolean): void {
  hidden = next
  const g = G
  if (!g) return
  const t = g.ctx.currentTime
  g.master.gain.cancelScheduledValues(t)
  g.master.gain.setTargetAtTime(hidden ? 0 : MASTER_VOL, t, 0.05)

  if (suspendTimer !== null) {
    clearTimeout(suspendTimer)
    suspendTimer = null
  }
  if (hidden) {
    suspendTimer = setTimeout(() => {
      suspendTimer = null
      if (hidden && G && G.ctx.state === 'running') void G.ctx.suspend()
    }, 260) // let the fade land before the clock stops
  } else if (g.ctx.state === 'suspended') {
    void g.ctx.resume()
  }
}

export function dispose(): void {
  const g = G
  G = null
  // A rebuilt context restarts its clock near 0; forget the old one so the first
  // update() cannot hand the free-rev integrator a negative frame delta.
  lastUpdateT = -1
  airRevN = 0
  if (!g) return
  if (suspendTimer !== null) {
    clearTimeout(suspendTimer)
    suspendTimer = null
  }
  for (const s of g.sources) {
    try {
      s.stop()
    } catch {
      // already stopped
    }
  }
  void g.ctx.close()
}

// ---------- per-frame update ----------

/** Called once per rendered frame. Reads telemetry, writes AudioParams. */
export function update(): void {
  const g = G
  if (!g || g.ctx.state !== 'running') return
  const t = g.ctx.currentTime

  const rpm = telemetry.rpm
  const throttle = telemetry.throttle
  const speed = telemetry.speedKmh
  const grounded = !telemetry.airborne

  // frame delta off the audio clock - update() is not handed one. Clamped so a
  // stalled tab cannot hand the integrator a huge step on resume.
  const dt = lastUpdateT >= 0 ? Math.min(0.1, t - lastUpdateT) : 0
  lastUpdateT = t

  // ---------- pitch ----------
  // rpm is normalised over the whole band including idle, so re-map from idle
  // to 1 before it drives the fundamental. The 0.95 exponent leans on the low
  // end just enough to feel torquey off the line.
  //
  // Grounded, the note follows telemetry.rpm - the loaded engine. AIRBORNE, the
  // wheels drive nothing, so rpm (which tracks ground speed) is the wrong model:
  // an engine with its load gone revs FREELY UP on the throttle and falls back off
  // it. So in the air we free-rev our own level instead of following rpm, and
  // reprime it from rpm every grounded frame so takeoff and landing hand off clean.
  const rpmN = clamp01((rpm - RPM_IDLE) / (1 - RPM_IDLE))
  let revN: number
  if (grounded) {
    revN = rpmN
    airRevN = rpmN
  } else {
    const target = throttle > 0.05 ? 1 : 0 //          limiter on the gas, idle off it
    const rate = throttle > 0.05 ? AIR_REV_UP : AIR_REV_DOWN
    airRevN += (target - airRevN) * (1 - Math.exp(-rate * dt))
    revN = airRevN
  }
  const hz = IDLE_HZ + (REDLINE_HZ - IDLE_HZ) * Math.pow(revN, 0.95)
  g.freqBus.offset.setTargetAtTime(hz, t, 0.028)

  // ---------- tone: the filter IS the throttle ----------
  // Closed = a docile burble. Open = a snarl. Tracking the fundamental keeps the
  // harmonic count roughly constant so the note does not get thin as it climbs.
  // Uses revN, not rpmN, so a free-revving jump brightens as it spins up.
  const load = Math.max(throttle, revN * 0.4)
  const cutoff = 240 + 3300 * load + hz * 2.3
  g.lp.frequency.setTargetAtTime(cutoff, t, 0.05)
  g.lp.Q.setTargetAtTime(0.7 + 1.3 * throttle, t, 0.1)
  g.harmGain.gain.setTargetAtTime(0.04 + 0.18 * load, t, 0.06)
  g.intakeGain.gain.setTargetAtTime(0.015 + 0.09 * throttle + 0.05 * revN, t, 0.05)

  // ---------- level: idle never falls silent ----------
  const eng = 0.1 + 0.26 * throttle + 0.13 * revN + Math.min(speed / 190, 1) * 0.05
  g.engineGain.gain.setTargetAtTime(eng * 0.62, t, 0.05)

  // ---------- skid ----------
  const skidding = grounded && telemetry.onRoad && speed > 12
  const slipAmt = skidding ? smoothstep(0.16, 0.75, telemetry.slip) : 0
  g.skidGain.gain.setTargetAtTime(slipAmt * 0.2 * Math.min(1, speed / 40), t, 0.045)
  g.skidBp.frequency.setTargetAtTime(700 + 2100 * telemetry.slip, t, 0.06)

  // ---------- road ----------
  const rough = telemetry.onRoad ? 1 : 1.8
  g.roadGain.gain.setTargetAtTime(grounded ? Math.min(1, speed / 120) * 0.055 * rough : 0, t, 0.06)
  g.roadLp.frequency.setTargetAtTime(telemetry.onRoad ? 230 : 380, t, 0.15)

  // ---------- impact ----------
  // telemetry.impact only ever jumps up on a hit and decays otherwise, so a
  // rising edge is the collision. The debounce stops a scrape machine-gunning.
  const imp = telemetry.impact
  if (imp > prevImpact + 0.04 && imp > 0.1 && t - lastImpactAt > IMPACT_DEBOUNCE_S) {
    lastImpactAt = t
    dbg.impacts++
    thump(0.06 + 0.34 * imp, 140, 45, 0.22)
    noiseBurst(0.24 * imp, 1100, 1.0, 0.13, 'bandpass')
  }
  prevImpact = imp

  dbg.targetHz = hz
  dbg.targetCutoffHz = cutoff
  dbg.rpm = rpm
  dbg.throttle = throttle
  dbg.slip = telemetry.slip
  dbg.speedKmh = speed
  dbg.gear = telemetry.gear
}

// ---------- one-shot voices ----------

/** Detach a finished voice so its gain node does not linger in the graph. */
function reap(src: AudioScheduledSourceNode, ...nodes: AudioNode[]) {
  src.onended = () => {
    src.disconnect()
    for (const n of nodes) n.disconnect()
  }
}

/** Exponential ramps cannot touch zero - this is the floor everything decays to. */
const EPS = 0.0001

function env(gain: GainNode, t: number, peak: number, attack: number, decay: number) {
  gain.gain.setValueAtTime(EPS, t)
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, EPS * 2), t + attack)
  gain.gain.exponentialRampToValueAtTime(EPS, t + attack + decay)
}

/** A pitched-down sine: the body of every thud in the game. */
function thump(peak: number, fromHz: number, toHz: number, decay: number) {
  const g = G
  if (!g) return
  const ctx = g.ctx
  const t = ctx.currentTime + 0.001
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(fromHz, t)
  osc.frequency.exponentialRampToValueAtTime(toHz, t + decay * 0.8)
  const amp = ctx.createGain()
  env(amp, t, peak, 0.004, decay)
  osc.connect(amp)
  amp.connect(g.sfx)
  reap(osc, amp)
  osc.start(t)
  osc.stop(t + decay + 0.06)
}

function noiseBurst(
  peak: number,
  hz: number,
  q: number,
  decay: number,
  type: BiquadFilterType = 'lowpass'
) {
  const g = G
  if (!g) return
  const ctx = g.ctx
  const t = ctx.currentTime + 0.001
  const src = ctx.createBufferSource()
  src.buffer = g.noise
  const filt = ctx.createBiquadFilter()
  filt.type = type
  filt.frequency.value = hz
  filt.Q.value = q
  const amp = ctx.createGain()
  env(amp, t, peak, 0.002, decay)
  src.connect(filt)
  filt.connect(amp)
  amp.connect(g.sfx)
  reap(src, filt, amp)
  src.start(t, burstOffset())
  src.stop(t + decay + 0.05)
}

/**
 * FM bell. One sine modulating another's frequency, with the modulation index
 * collapsing over ~200ms: bright metallic attack, pure sine tail. This is the
 * whole reason a chime sounds like a chime and not like a beep.
 */
function bell(hz: number, at: number, peak: number, decay: number, brightness = 2.4) {
  const g = G
  if (!g) return
  const ctx = g.ctx
  const car = ctx.createOscillator()
  car.type = 'sine'
  car.frequency.value = hz
  const mod = ctx.createOscillator()
  mod.type = 'sine'
  mod.frequency.value = hz * 3
  const modG = ctx.createGain()
  modG.gain.setValueAtTime(hz * brightness, at)
  modG.gain.exponentialRampToValueAtTime(1, at + Math.min(decay, 0.24))
  mod.connect(modG)
  modG.connect(car.frequency)

  const amp = ctx.createGain()
  env(amp, at, peak, 0.006, decay)
  car.connect(amp)
  amp.connect(g.sfx)

  reap(car, amp)
  reap(mod, modG)
  car.start(at)
  mod.start(at)
  car.stop(at + decay + 0.08)
  mod.stop(at + decay + 0.08)
}

function tone(type: OscillatorType, hz: number, at: number, peak: number, decay: number) {
  const g = G
  if (!g) return
  const ctx = g.ctx
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = hz
  const amp = ctx.createGain()
  env(amp, at, peak, 0.005, decay)
  osc.connect(amp)
  amp.connect(g.sfx)
  reap(osc, amp)
  osc.start(at)
  osc.stop(at + decay + 0.06)
}

const semi = (root: number, s: number) => root * Math.pow(2, s / 12)

// ---------- the delight API ----------

/** Sun shard pickup. `combo` = how many you have taken this lap, 0-based: each one climbs the scale. */
export function playChime(combo: number): void {
  const g = G
  if (!g) return
  const t = g.ctx.currentTime + 0.002
  dbg.chimes++
  const hz = semi(G5, PENTATONIC[Math.min(combo, PENTATONIC.length - 1)])
  bell(hz, t, 0.32, 0.55)
  tone('triangle', hz * 2, t, 0.09, 0.26) // shimmer an octave up
}

/** Lap complete. The best-lap variant is longer, higher and has a root under it. */
export function playLap(best: boolean): void {
  const g = G
  if (!g) return
  const t = g.ctx.currentTime + 0.002
  dbg.laps++
  const root = best ? E5 : C5
  const notes = best ? [0, 4, 7, 12] : [0, 4, 7]
  for (let i = 0; i < notes.length; i++) {
    const at = t + i * 0.1
    bell(semi(root, notes[i]), at, 0.24, 0.4)
    tone('triangle', semi(root, notes[i]), at, 0.07, 0.22)
  }
  if (best) {
    tone('sine', root / 4, t, 0.16, 0.9) //   two octaves down: the weight of a record
    tone('sine', root * 2, t + 0.3, 0.05, 1.1) // a held sparkle over the top
  }
}

/**
 * Garage selector tick. A UI blip, not a chime: short, bright, no tail.
 * `position` is 0..1 along whatever is being scrolled, so the pitch climbs as
 * you move up the list - a little ladder, whether that list has 4 rungs or 11.
 */
export function playSelect(position: number): void {
  const g = G
  if (!g) return
  const t = g.ctx.currentTime + 0.002
  dbg.selects++
  const hz = semi(C5 * 2, clamp01(position) * 10) // up to a major seventh above
  bell(hz, t, 0.13, 0.16, 1.6)
  tone('sine', hz * 1.5, t, 0.045, 0.1)
}

/**
 * Lap rejected for skipped sectors. Deliberately NOT a buzzer: two flat notes
 * falling a minor third, soft and short. It reads as a shrug, not a telling-off -
 * the lap flourish is what you want back, and its absence is the whole message.
 */
export function playVoid(): void {
  const g = G
  if (!g) return
  const t = g.ctx.currentTime + 0.002
  dbg.voids++
  tone('triangle', 392.0, t, 0.15, 0.13) //         G4
  tone('triangle', 329.63, t + 0.11, 0.15, 0.28) // E4
  noiseBurst(0.04, 650, 0.7, 0.08)
}

/** Wheels back on the ground after a jump. `intensity` 0..1 from air time. */
export function playLanding(intensity: number): void {
  if (!G) return
  dbg.landings++
  const i = clamp(intensity, 0, 1)
  thump(0.1 + 0.22 * i, 95, 38, 0.3)
  noiseBurst(0.09 * i, 900, 0.8, 0.11)
}

/**
 * A trick landed. A bright ascending sparkle up the pentatonic, longer and
 * fuller the bigger the trick. Sits under the shard chime in weight so a whole
 * combo chaining does not out-shout the engine - volume-respectful by design.
 * `points` is the trick's score; the run grows from 2 notes up to 5 for a
 * show-off, with a low bloom left ringing under the biggest ones.
 */
export function playTrick(points: number): void {
  const g = G
  if (!g) return
  const t = g.ctx.currentTime + 0.002
  dbg.tricks++
  const big = clamp01(points / 500) //     0..1 how show-off this was
  const steps = 2 + Math.round(big * 3) //  2..5 notes
  for (let i = 0; i < steps; i++) {
    const at = t + i * 0.058
    const hz = semi(G5, PENTATONIC[Math.min(i + 1, PENTATONIC.length - 1)])
    bell(hz, at, 0.17 + 0.11 * big, 0.3)
    tone('triangle', hz * 2, at, 0.045 + 0.035 * big, 0.16) // shimmer an octave up
  }
  if (big > 0.6) tone('sine', G5 / 4, t, 0.1, 0.7) // the weight of a big one
}

/** All ten shards. A five-note run with a chord left ringing under it. */
export function playAllFound(): void {
  const g = G
  if (!g) return
  const t = g.ctx.currentTime + 0.002
  const run = [0, 4, 7, 12, 16]
  for (let i = 0; i < run.length; i++) bell(semi(C5, run[i]), t + i * 0.085, 0.26, 0.5)
  for (const s of [0, 7, 12]) tone('sine', semi(C5, s) / 2, t + 0.34, 0.07, 1.3)
}
