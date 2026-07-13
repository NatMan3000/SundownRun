// ============================================================
//  BANTER DIRECTOR - decides when the DJ is allowed to think
// ------------------------------------------------------------
//  The hard problem this module exists for: the language model and
//  the renderer share ONE GPU, and the constitution's 60fps budget
//  outranks everything. So generation never fires on a schedule -
//  it fires when (a) something banter-worthy actually happened,
//  (b) the frame pacing is demonstrably healthy right now, and
//  (c) the DJ has not spoken too recently. When frames and banter
//  collide, banter loses: requests are dropped, never queued up.
//
//  Runs one rAF loop on the main thread (same discipline as the
//  HUD): poll the mutable game singletons, keep a frame-time EMA,
//  and talk to the worker. No React, no per-frame allocation on
//  the happy path.
//
//  Dev surface: window.__banter (see installDevHook below), plus
//  URL params ?dj=1 (force on), ?dj=0 (force off), ?djstress=1
//  (continuous back-to-back generation - the worst-case perf probe,
//  pairs with ?demo=1&djwait=1).
// ============================================================

import { CONFIG } from '../core/config'
import { telemetry } from '../core/telemetry'
import { useGameStore } from '../core/store'
import { RECENT_SIZE, tricksState } from '../core/tricks'
import { formatLap } from '../ui/format'
import { gateLine } from './gate'
import { playVoice, speaking } from './radioAudio'
import type { MainToWorker, Style, WorkerToMain } from './protocol'

// ---------- scheduling constants ----------

/** Minimum quiet time between lines; big moments may cut in sooner. */
const COOLDOWN_MS = 9000
const HOT_COOLDOWN_MS = 5000
/** A pending event older than this is stale - the moment has passed. */
const PENDING_TTL_MS = 3500
/** EMA above this is not a healthy 60fps-class frame time, full stop. */
const EMA_ABS_LIMIT_MS = 20
/** How far above its own session baseline the EMA may sit and still count as healthy. */
const EMA_BASELINE_FACTOR = 1.4
const EMA_BASELINE_SLACK_MS = 1.2
/** A single frame this far over baseline is a spike; hold fire briefly after one. */
const SPIKE_HOLDOFF_MS = 500

const MAX_GEN_LOG = 200
const SAMPLE_CAP = 20000

// ---------- URL switches ----------

function urlParam(name: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(name)
}

/** The single source of truth for "is the radio DJ feature on in this session". */
export function banterEnabled(): boolean {
  if (typeof window === 'undefined') return false
  if (urlParam('dj') === '0') return false
  if (urlParam('dj') === '1' || urlParam('djstress') === '1') return true
  return CONFIG.radioDj
}

const stress = (): boolean => urlParam('djstress') === '1'

/** Voice is a layer on top of banter - never on in stress runs (perf probe). */
function voiceEnabled(): boolean {
  if (stress()) return false
  if (urlParam('djvoice') === '0') return false
  if (urlParam('djvoice') === '1') return true
  return CONFIG.radioVoice
}

// ---------- observable state (BanterHud polls this - mutate, never replace) ----------

export type BanterStatus = 'idle' | 'loading' | 'warm' | 'unavailable'

export const banterState = {
  status: 'idle' as BanterStatus,
  pct: 0,
  loadedMB: 0,
  totalMB: 0,
  line: null as string | null,
  lineNonce: 0,
  lineShownAt: 0,
  /** Who said the current line - drives the chip's name tag + accent. */
  speaker: '',
  speakerId: 'max',
  /** The hosts' actual voices (Supertonic TTS in the same worker). */
  voice: 'off' as 'off' | 'loading' | 'warm' | 'unavailable',
}

/** Voice preset + delivery speed per host - Max talks fast, Cinder does not hurry. */
const HOST_VOICES: Record<string, { id: string; speed: number }> = {
  max: { id: CONFIG.djVoiceMax, speed: 1.12 },
  cinder: { id: CONFIG.djVoiceCinder, speed: 0.95 },
}

// CALDERA FM has two hosts; the director routes each moment to the voice it
// suits (Nathan direction, 2026-07-14: personas switch, each with a flavour).
// Max is the hype man, Doc Cinder the deadpan scientist - so wild moments
// mostly go to Max, mild ones mostly to Cinder, with enough crossover that
// an occasional bone-dry line lands on a huge trick (where deadpan is best).
const PERSONA_NAMES: Record<string, string> = { max: 'Magma Max', cinder: 'Doc Cinder' }

function pickPersona(heat: Heat): string {
  const r = Math.random()
  if (heat === 'wild') return r < 0.8 ? 'max' : 'cinder'
  if (heat === 'mild') return r < 0.75 ? 'cinder' : 'max'
  return r < 0.55 ? 'max' : 'cinder'
}

// Delivery shape, weighted by heat but never hard-coupled to it - the
// mismatches are the best lines (a crazytown meltdown over a 2-point timber,
// a flat one-worder after a monster combo). Nathan direction, 2026-07-14:
// sometimes 1 word, sometimes 1-2 short sentences, sometimes crazytown.
function pickStyle(heat: Heat): Style {
  const r = Math.random()
  if (heat === 'wild') return r < 0.12 ? 'one-word' : r < 0.6 ? 'standard' : 'crazytown'
  if (heat === 'mild') return r < 0.3 ? 'one-word' : r < 0.92 ? 'standard' : 'crazytown'
  return r < 0.15 ? 'one-word' : r < 0.85 ? 'standard' : 'crazytown'
}

// ---------- evidence: per-generation log + frame-delta buckets ----------

interface GenLog {
  event: string
  persona: string
  style: Style
  raw: string
  shown: string | null
  prefillMs: number
  decodeMs: number
  tokens: number
  tps: number
}

const stats = {
  requested: 0,
  completed: 0,
  shown: 0,
  spoken: 0,
  speechFailed: 0,
  gateRejected: 0,
  genFailed: 0,
  expired: 0,
  replaced: 0,
  gens: [] as GenLog[],
}

/** rAF deltas bucketed by what the model was doing at the time. */
const buckets = {
  load: { arr: new Float64Array(SAMPLE_CAP), n: 0 },
  gen: { arr: new Float64Array(SAMPLE_CAP), n: 0 },
  idle: { arr: new Float64Array(SAMPLE_CAP), n: 0 },
}

function bucketStats(b: { arr: Float64Array; n: number }) {
  if (b.n === 0) return { n: 0, avgMs: 0, p99Ms: 0, maxMs: 0 }
  let sum = 0
  let max = 0
  for (let i = 0; i < b.n; i++) {
    sum += b.arr[i]
    if (b.arr[i] > max) max = b.arr[i]
  }
  const sorted = b.arr.slice(0, b.n).sort()
  return {
    n: b.n,
    avgMs: sum / b.n,
    p99Ms: sorted[Math.min(b.n - 1, Math.max(0, Math.ceil(0.99 * b.n) - 1))],
    maxMs: max,
  }
}

// ---------- internals ----------

/**
 * HEAT is tone, priority is scheduling - kept separate on purpose. A tiny
 * timber hop and a lap-complete are both low-priority, but the DJ should
 * shrug at one and stay warm about the other; a x4 combo and a monster
 * wipeout both deserve his BIGGEST call (Nathan direction, 2026-07-13:
 * dynamics must track the size of the moment).
 */
type Heat = 'mild' | 'solid' | 'wild'

interface Pending {
  prio: 1 | 2 | 3
  heat: Heat
  text: string
  at: number
}

/** Last few openers actually shown - fed back so the hosts stop repeating themselves. */
const recentOpeners: string[] = []

function noteOpener(line: string): void {
  const word = line.split(/\s+/)[0]?.replace(/[^A-Za-z']/g, '')
  if (!word || word.length < 2) return
  if (recentOpeners.includes(word)) return
  recentOpeners.push(word)
  if (recentOpeners.length > 3) recentOpeners.shift()
}

let started = false
let worker: Worker | null = null
let inFlight = false
let inFlightEvent = ''
let inFlightPersona = 'max'
let inFlightStyle: Style = 'standard'
let genId = 0
/** A gated line waiting on its voice clip before it shows. */
let pendingSpeech: { text: string; personaId: string } | null = null
let pendingSpeechAt = 0
const SPEECH_TIMEOUT_MS = 15000
let pending: Pending | null = null
let lastLineAt = 0
let greeted = false
let stressIdx = 0
let raf = 0
let lastTickAt = 0

// frame health
let ema = 0
let baseline = Infinity
let lastSpikeAt = 0

// game-state snapshots for edge detection
let seenTrickNonce = 0
let prevLapCount = 0
let prevBestLapMs: number | null = null
let prevFound = 0
let impactArmed = true
let topSpeedCalled = false
let wipeoutCount = 0
/** Small tricks (a 2-point timber tap) get at most one dry aside per this window. */
let lastMildTrickAt = -Infinity
const MILD_TRICK_GAP_MS = 45000

/**
 * Not every landing deserves airtime (Nathan direction, 2026-07-14: roughly
 * one in five trick landings, and the bigger the moment the more likely the
 * hosts pick it up). Each candidate trick landing rolls against its HEAT
 * tier; crashes roll their own smaller chance. Rare one-off moments (new
 * best lap, all shards, top speed, the greeting) always play.
 */
const TRICK_CHANCE: Record<Heat, number> = { mild: 0.08, solid: 0.2, wild: 0.65 }
const CRASH_CHANCE = 0.25

const STRESS_EVENTS = [
  'landed BACKFLIP, 250 points, at 78 km/h | HEAT: solid',
  'WIPEOUT - crashed and lost 6400 points | HEAT: wild',
  'NEW BEST LAP - 1:41.230 | HEAT: wild',
  'a geyser just blasted the car into the sky | HEAT: wild',
  'landed MEGA DRIFT, 210 points | HEAT: solid',
  'landed TIMBER, 2 points, at 40 km/h | HEAT: mild',
]

const send = (m: MainToWorker): void => worker?.postMessage(m)

const introUp = (): boolean => document.documentElement.hasAttribute('data-intro')

/** Offer a candidate line-moment. Single slot: newest wins ties, higher priority always wins. */
function offer(prio: 1 | 2 | 3, heat: Heat, text: string, now: number): void {
  if (pending && pending.prio > prio) return
  if (pending) stats.replaced++
  pending = { prio, heat, text, at: now }
}

// ---------- event detection (called once per rAF tick) ----------

function pollTricks(now: number): void {
  if (tricksState.nonce === seenTrickNonce) return
  const fresh = Math.min(tricksState.nonce - seenTrickNonce, RECENT_SIZE)
  const from = tricksState.nonce - fresh
  seenTrickNonce = tricksState.nonce

  // A landing emits its whole chain in one physics step - pick ONE moment to
  // talk about, best first: wipeouts and combos beat the tricks inside them.
  let best: (Pending & { always?: boolean }) | null = null
  for (let k = from; k < from + fresh; k++) {
    const ev = tricksState.recent[k % RECENT_SIZE]
    if (!ev) continue
    let prio: 1 | 2 | 3
    let heat: Heat
    let text: string
    let always = false
    if (ev.label === 'WIPEOUT') {
      const lost = Math.max(0, -ev.points)
      wipeoutCount++
      prio = 3
      heat = lost >= 4000 ? 'wild' : 'solid'
      text = `WIPEOUT number ${wipeoutCount} this session - crashed and lost ${lost} points`
      always = true // a wipeout ALWAYS gets a call (Nathan, 2026-07-14)
    } else if (ev.label === 'GEYSER LAUNCH') {
      prio = 3
      heat = 'wild'
      text = 'a geyser just blasted the car into the sky'
    } else if (ev.label.startsWith('COMBO')) {
      prio = 3
      heat = 'wild'
      text = `landed a ${ev.label} trick chain, ${ev.points} bonus points in one flight`
    } else if (ev.label.includes('DRIFT')) {
      prio = 1
      heat = ev.points >= 250 ? 'solid' : 'mild'
      text = `held a long drift: ${ev.label}, ${ev.points} points`
    } else if (ev.points < 30) {
      // A timber tap is a shrug, not a show - and not every time.
      if (now - lastMildTrickAt < MILD_TRICK_GAP_MS) continue
      prio = 1
      heat = 'mild'
      text = `landed ${ev.label}, ${ev.points} points, at ${Math.round(telemetry.speedKmh)} km/h`
    } else {
      prio = ev.points >= 500 ? 3 : 2
      heat = ev.points >= 500 ? 'wild' : 'solid'
      text = `landed ${ev.label}, ${ev.points} points${ev.comboCount > 1 ? `, combo x${ev.comboCount}` : ''}, at ${Math.round(telemetry.speedKmh)} km/h`
    }
    if (!best || prio >= best.prio) best = { prio, heat, text, at: now, always }
  }
  if (best && (best.always || Math.random() < TRICK_CHANCE[best.heat])) {
    if (best.heat === 'mild') lastMildTrickAt = now
    offer(best.prio, best.heat, best.text, now)
  }
}

function pollStore(now: number): void {
  const s = useGameStore.getState()

  if (s.lapCount !== prevLapCount) {
    prevLapCount = s.lapCount
    const isNewBest = s.bestLapMs !== prevBestLapMs && s.bestLapMs === s.lastLapMs && !s.lastLapDirty
    prevBestLapMs = s.bestLapMs
    if (isNewBest) offer(3, 'wild', `NEW BEST LAP - ${formatLap(s.lastLapMs)}`, now)
    else
      offer(
        1,
        'mild',
        `finished lap ${s.lapCount} in ${formatLap(s.lastLapMs)}${s.lastLapDirty ? ' - off road, so it does not count for records' : ''}`,
        now
      )
  }

  if (s.collectiblesFound !== prevFound) {
    const grew = s.collectiblesFound > prevFound
    prevFound = s.collectiblesFound
    if (grew && s.collectiblesTotal > 0) {
      if (s.collectiblesFound === s.collectiblesTotal)
        offer(3, 'wild', `every one of the ${s.collectiblesTotal} sun shards is collected!`, now)
      else offer(1, 'mild', `picked up sun shard ${s.collectiblesFound} of ${s.collectiblesTotal}`, now)
    }
  }
}

function pollTelemetry(now: number): void {
  // Hard crash - edge-triggered off the impact envelope the camera kick uses.
  if (impactArmed && telemetry.impact >= 0.65) {
    impactArmed = false
    if (Math.random() < CRASH_CHANCE)
      offer(2, 'solid', `a big crash - slammed into something hard at ${Math.round(telemetry.speedKmh)} km/h`, now)
  } else if (!impactArmed && telemetry.impact < 0.15) {
    impactArmed = true
  }

  // Flat out - once per session, near the configured ceiling.
  if (!topSpeedCalled && telemetry.speedKmh >= CONFIG.topSpeedKmh - 8) {
    topSpeedCalled = true
    offer(2, 'solid', `flat out at ${Math.round(telemetry.speedKmh)} km/h - full top speed`, now)
  }
}

// ---------- frame health ----------

function frameHealth(delta: number, now: number): void {
  ema = ema === 0 ? delta : ema * 0.9 + delta * 0.1
  baseline = Math.min(baseline, Math.max(ema, 5))
  if (delta > Math.max(34, baseline * 2.5)) lastSpikeAt = now
}

function framesHealthy(now: number): boolean {
  return (
    ema > 0 &&
    ema <= EMA_ABS_LIMIT_MS &&
    ema <= baseline * EMA_BASELINE_FACTOR + EMA_BASELINE_SLACK_MS &&
    now - lastSpikeAt > SPIKE_HOLDOFF_MS
  )
}

// ---------- dispatch ----------

function dispatch(event: string, persona: string, style: Style): void {
  inFlight = true
  inFlightEvent = event
  inFlightPersona = persona
  inFlightStyle = style
  stats.requested++
  const avoid = recentOpeners.length > 0 ? ` | do not start with: ${recentOpeners.join(', ')}` : ''
  send({ type: 'generate', id: ++genId, event: `${event} | STYLE: ${style}${avoid}`, persona, style })
}

function maybeDispatch(now: number): void {
  if (banterState.status !== 'warm' || inFlight) return

  // Stress probe: hammer the decoder back-to-back, no gates, no mercy.
  // Exists purely to measure the worst case (?djstress=1).
  if (stress()) {
    const styles: Style[] = ['standard', 'one-word', 'crazytown']
    dispatch(
      STRESS_EVENTS[stressIdx % STRESS_EVENTS.length],
      stressIdx % 2 === 0 ? 'max' : 'cinder',
      styles[stressIdx % styles.length]
    )
    stressIdx++
    return
  }

  if (introUp()) return
  if (speaking()) return // a host is mid-sentence - nobody interrupts on this station

  if (!greeted) {
    greeted = true
    offer(1, 'solid', `show opening - welcome the driver of the ${CONFIG.carName} to the caldera`, now)
  }

  if (!pending) return
  if (now - pending.at > PENDING_TTL_MS) {
    pending = null
    stats.expired++
    return
  }
  const cooldown = pending.prio === 3 ? HOT_COOLDOWN_MS : COOLDOWN_MS
  if (lastLineAt !== 0 && now - lastLineAt < cooldown) return
  if (!framesHealthy(now)) return // banter loses; the TTL will bin it if this persists

  const ev = `${pending.text} | HEAT: ${pending.heat}`
  const persona = pickPersona(pending.heat)
  const style = pickStyle(pending.heat)
  pending = null
  dispatch(ev, persona, style)
}

// ---------- worker messages ----------

function onWorkerMessage(e: MessageEvent): void {
  const m = e.data as WorkerToMain
  switch (m.type) {
    case 'progress':
      banterState.pct = m.pct
      banterState.loadedMB = m.loadedMB
      banterState.totalMB = m.totalMB
      break
    case 'ready':
      banterState.status = 'warm'
      console.info(`[banter] model warm - load ${m.loadMs}ms, warmup ${m.warmupMs}ms`)
      break
    case 'unavailable':
      banterState.status = 'unavailable'
      console.info(`[banter] unavailable: ${m.reason}`)
      worker?.terminate()
      worker = null
      break
    case 'line': {
      stats.completed++
      lastLineAt = performance.now()
      const shown = gateLine(m.text, inFlightStyle)
      if (stats.gens.length < MAX_GEN_LOG)
        stats.gens.push({
          event: inFlightEvent,
          persona: inFlightPersona,
          style: inFlightStyle,
          raw: m.text,
          shown,
          prefillMs: m.prefillMs,
          decodeMs: m.decodeMs,
          tokens: m.tokens,
          tps: m.tps,
        })
      if (!shown) {
        inFlight = false
        stats.gateRejected++
        break
      }
      if (banterState.voice === 'warm') {
        // Hold the chip until the clip is synthesised - text and voice land
        // together, radio-style. inFlight stays true so nothing else queues.
        pendingSpeech = { text: shown, personaId: inFlightPersona }
        pendingSpeechAt = performance.now()
        const v = HOST_VOICES[inFlightPersona] ?? HOST_VOICES.max
        send({ type: 'speak', id: ++genId, text: shown, voice: v.id, speed: v.speed })
      } else {
        inFlight = false
        showLine(shown, inFlightPersona)
      }
      break
    }
    case 'genfail':
      inFlight = false
      stats.genFailed++
      console.warn(`[banter] generation failed: ${m.message}`)
      break
    case 'voiceready':
      banterState.voice = 'warm'
      console.info(`[banter] voice warm - TTS load+warmup ${m.loadMs}ms`)
      break
    case 'voiceunavailable':
      banterState.voice = 'unavailable'
      console.info(`[banter] voice unavailable (text banter unaffected): ${m.reason}`)
      break
    case 'speech': {
      inFlight = false
      const p = pendingSpeech
      pendingSpeech = null
      if (!p) break
      const durationMs = playVoice(m.audio, m.sampleRate)
      if (durationMs > 0) stats.spoken++
      showLine(p.text, p.personaId)
      // Cooldown counts from the END of the clip - hosts never talk over themselves.
      lastLineAt = performance.now() + durationMs
      break
    }
    case 'speechfail': {
      inFlight = false
      stats.speechFailed++
      const p = pendingSpeech
      pendingSpeech = null
      if (p) showLine(p.text, p.personaId)
      console.warn(`[banter] speech failed (line shown text-only): ${m.message}`)
      break
    }
  }
}

function showLine(text: string, personaId: string): void {
  stats.shown++
  banterState.line = text
  banterState.lineNonce++
  banterState.lineShownAt = performance.now()
  banterState.speaker = PERSONA_NAMES[personaId] ?? PERSONA_NAMES.max
  banterState.speakerId = personaId
  noteOpener(text)
}

// ---------- the loop ----------

function tick(now: number): void {
  raf = requestAnimationFrame(tick)
  const delta = lastTickAt === 0 ? 0 : now - lastTickAt
  lastTickAt = now

  if (delta > 0 && delta < 250) {
    frameHealth(delta, now)
    const b =
      banterState.status === 'loading' ? buckets.load : inFlight ? buckets.gen : buckets.idle
    if (b.n < SAMPLE_CAP) b.arr[b.n++] = delta
  }

  // Watchdog: a speak request that never comes back must not wedge banter.
  if (pendingSpeech && now - pendingSpeechAt > SPEECH_TIMEOUT_MS) {
    const p = pendingSpeech
    pendingSpeech = null
    inFlight = false
    stats.speechFailed++
    showLine(p.text, p.personaId)
  }

  pollTricks(now)
  pollStore(now)
  pollTelemetry(now)
  maybeDispatch(now)
}

// ---------- lifecycle + dev hook ----------

declare global {
  interface Window {
    __banter?: {
      /** True once the model is loaded AND shader-warm (djwait keys off this). */
      readonly warm: boolean
      state: typeof banterState
      stats: typeof stats
      /** Frame-delta comparison: while loading vs while generating vs idle. */
      report: () => {
        load: ReturnType<typeof bucketStats>
        gen: ReturnType<typeof bucketStats>
        idle: ReturnType<typeof bucketStats>
        counts: Omit<typeof stats, 'gens'>
      }
      /** Force one line through, bypassing every gate - authoring tool. */
      say: (event: string, persona?: string, style?: Style) => void
      gate: typeof gateLine
    }
  }
}

function installDevHook(): void {
  window.__banter = {
    get warm() {
      return banterState.status === 'warm'
    },
    state: banterState,
    stats,
    report: () => {
      const { gens: _gens, ...counts } = stats
      return {
        load: bucketStats(buckets.load),
        gen: bucketStats(buckets.gen),
        idle: bucketStats(buckets.idle),
        counts,
      }
    },
    say: (event: string, persona?: string, style?: Style) => {
      if (banterState.status !== 'warm' || inFlight) {
        console.warn(`[banter] not ready to say anything (status ${banterState.status}, inFlight ${inFlight})`)
        return
      }
      dispatch(event, persona ?? (Math.random() < 0.5 ? 'max' : 'cinder'), style ?? 'standard')
    },
    gate: gateLine,
  }
}

/**
 * Idempotent - BanterHud calls this on mount. The worker and model survive
 * for the page's lifetime once started; a 3GB model is not something to
 * tear down and reload on a React remount.
 */
export function startBanter(): void {
  if (started || typeof window === 'undefined') return
  started = true

  if (!('gpu' in navigator)) {
    banterState.status = 'unavailable'
    console.info('[banter] unavailable: no WebGPU - feature absent, game unaffected')
    return
  }

  const s = useGameStore.getState()
  seenTrickNonce = tricksState.nonce
  prevLapCount = s.lapCount
  prevBestLapMs = s.bestLapMs
  prevFound = s.collectiblesFound

  worker = new Worker(new URL('./banter.worker.ts', import.meta.url), { type: 'module' })
  worker.addEventListener('message', onWorkerMessage)
  const voice = voiceEnabled()
  send({ type: 'load', voice })
  banterState.status = 'loading'
  banterState.voice = voice ? 'loading' : 'off'
  installDevHook()
  raf = requestAnimationFrame(tick)
  void raf
}
