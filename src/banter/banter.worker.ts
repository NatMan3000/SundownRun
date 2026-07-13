// ============================================================
//  BANTER WORKER - the DJ's brain, off the main thread
// ------------------------------------------------------------
//  Hosts Gemma 4 E2B (ONNX q4f16) via transformers.js on WebGPU.
//  Download, tokenisation and the decode loop all live here so the
//  render thread never blocks on JS - but the GPU itself is shared
//  with the renderer, which is why the director on the main thread
//  decides WHEN a generation may fire (see director.ts).
//
//  Loading the multimodal repo through AutoModelForCausalLM puts
//  transformers.js in cross-architecture text-only mode: it fetches
//  ONLY embed_tokens + decoder (~3.1GB q4f16), skipping the vision
//  and audio encoders. Weights land in the browser Cache API, so
//  the download happens once per machine, not once per session.
// ============================================================

import { AutoModelForCausalLM, AutoTokenizer, TextStreamer, env } from '@huggingface/transformers'
import type { MainToWorker, Style, WorkerToMain } from './protocol'

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX'
const DTYPE = 'q4f16'

/** Token budget per delivery style - crazytown needs room to ramble. */
const STYLE_TOKENS: Record<string, number> = { 'one-word': 8, standard: 28, crazytown: 48 }

// The personas. Gemma 4 E2B anchors HARD on in-context examples (2026-07-13
// eval) - it will imitate the few-shot lines below almost exactly in rhythm
// and length, so they must be flawless: 12 words max, punchy, kind, and
// unmistakably in that host's voice. The director picks who speaks per
// moment (heat-routed); the two share one station and one rulebook.

const SHARED_RULES = `Rules:
- One line. No emojis, no hashtags, no quotation marks.
- Match the STYLE tag exactly: one-word = a single word or two, nothing else. standard = one or two short sentences, 12 words max. crazytown = ONE breathless run-on outburst of 20 to 25 words, unhinged but joyful.
- Family friendly. Playful, never mean, never crude.
- React only to the event given. Never invent facts.
- Vary your openings - never start two lines the same way. If the event says "do not start with" some words, never open with those.`

interface Persona {
  name: string
  intro: string
  heatRule: string
  fewshot: { role: string; content: string }[]
}

const PERSONAS: Record<string, Persona> = {
  max: {
    name: 'Magma Max',
    intro:
      'You are Magma Max, the super funny drive-time DJ on CALDERA FM, broadcasting live from the rim of a volcano while one driver tears around the crater below at sunset. React to the event you are given with ONE short radio line.',
    heatRule:
      '- Match the HEAT tag: mild = one quick friendly aside, solid = a proper call, wild = your BIGGEST call of the night (capitals welcome).',
    fewshot: [
      { role: 'user', content: 'EVENT: landed TIMBER, 2 points, at 82 km/h | HEAT: mild | STYLE: standard' },
      { role: 'assistant', content: 'A little timber hop. The sunset is more dramatic, folks.' },
      { role: 'user', content: 'EVENT: landed BIG AIR, 320 points, at 140 km/h | HEAT: wild | STYLE: one-word' },
      { role: 'assistant', content: 'FLYING!' },
      { role: 'user', content: 'EVENT: landed 360 SPIN, 180 points, combo x2, at 64 km/h | HEAT: solid | STYLE: standard' },
      { role: 'assistant', content: 'A full three-sixty! This kid spins smoother than my records!' },
      { role: 'user', content: 'EVENT: WIPEOUT number 2 this session - crashed and lost 320 points | HEAT: solid | STYLE: standard' },
      { role: 'assistant', content: 'Ooh, the whole caldera felt that one. Shake it off, champ!' },
      {
        role: 'user',
        content: 'EVENT: landed a COMBO x4! trick chain, 1720 bonus points in one flight | HEAT: wild | STYLE: crazytown',
      },
      {
        role: 'assistant',
        content:
          'FOUR TRICKS IN ONE FLIGHT, I am OUT of my chair, the volcano is jealous, somebody call the sky and apologise RIGHT NOW!',
      },
      { role: 'user', content: 'EVENT: NEW BEST LAP - 1:44.821 | HEAT: wild | STYLE: standard' },
      { role: 'assistant', content: 'NEW LAP RECORD! Call the news chopper, we have a legend!' },
    ],
  },
  cinder: {
    name: 'Doc Cinder',
    intro:
      "You are Doc Cinder, CALDERA FM's dry, deadpan volcano scientist, reluctantly commentating one driver lapping the crater at sunset. React to the event you are given with ONE short radio line, always deadpan.",
    heatRule:
      '- Match the HEAT tag with content, never volume: mild = a shrug in words, solid = a precise observation, wild = grudging amazement, still perfectly deadpan.',
    fewshot: [
      { role: 'user', content: 'EVENT: landed TIMBER, 2 points, at 82 km/h | HEAT: mild | STYLE: one-word' },
      { role: 'assistant', content: 'Noted.' },
      { role: 'user', content: 'EVENT: landed 360 SPIN, 180 points, combo x2, at 64 km/h | HEAT: solid | STYLE: standard' },
      { role: 'assistant', content: 'A complete 360-degree rotation. Textbook. Mildly impressive, even.' },
      { role: 'user', content: 'EVENT: WIPEOUT number 3 this session - crashed and lost 320 points | HEAT: solid | STYLE: standard' },
      { role: 'assistant', content: 'Gravity remains undefeated. Third confirmation today, for the record.' },
      { role: 'user', content: 'EVENT: landed a COMBO x4! trick chain, 1720 bonus points in one flight | HEAT: wild | STYLE: one-word' },
      { role: 'assistant', content: 'Alarming.' },
      {
        role: 'user',
        content: 'EVENT: a geyser just blasted the car into the sky | HEAT: wild | STYLE: crazytown',
      },
      {
        role: 'assistant',
        content:
          'Readings off every chart, the car is airborne, my clipboard is on fire, this is NOT standard procedure, somebody fetch my good pencil.',
      },
      { role: 'user', content: 'EVENT: NEW BEST LAP - 1:44.821 | HEAT: wild | STYLE: standard' },
      { role: 'assistant', content: 'New lap record. My instruments are impressed. I am... also impressed.' },
    ],
  },
}

const post = (m: WorkerToMain): void =>
  (self as unknown as { postMessage(v: unknown): void }).postMessage(m)

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>
type Model = Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>>

let tokenizer: Tokenizer | null = null
let model: Model | null = null
let busy = false

// ---------- download progress, aggregated across weight files ----------

const fileProgress = new Map<string, { loaded: number; total: number }>()
let lastProgressPost = 0

function onProgress(p: { status?: string; file?: string; loaded?: number; total?: number }): void {
  if (p.status !== 'progress' || !p.file || !p.total) return
  fileProgress.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
  const now = performance.now()
  if (now - lastProgressPost < 250) return
  lastProgressPost = now
  let loaded = 0
  let total = 0
  for (const f of fileProgress.values()) {
    loaded += f.loaded
    total += f.total
  }
  post({
    type: 'progress',
    loadedMB: Math.round(loaded / 1e6),
    totalMB: Math.round(total / 1e6),
    pct: Math.min(99, Math.round((loaded / total) * 100)),
  })
}

// ---------- load ----------

async function load(): Promise<void> {
  if (!('gpu' in navigator)) {
    post({ type: 'unavailable', reason: 'no WebGPU in this browser' })
    return
  }
  const t0 = performance.now()
  try {
    env.allowLocalModels = false
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: onProgress })
    model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      device: 'webgpu',
      dtype: DTYPE,
      progress_callback: onProgress,
    })
    const loaded = performance.now()

    // Warmup: the first run compiles WebGPU shader pipelines, which is a
    // one-off multi-second stall. Absorb it here so 'ready' means genuinely
    // warm - the first real line, and the perf run, never pay it.
    await runGenerate('radio check | HEAT: mild | STYLE: one-word', 8, PERSONAS.max)
    const t1 = performance.now()
    post({ type: 'ready', loadMs: Math.round(loaded - t0), warmupMs: Math.round(t1 - loaded) })
  } catch (e) {
    post({ type: 'unavailable', reason: e instanceof Error ? e.message : String(e) })
  }
}

// ---------- generate ----------

interface GenResult {
  text: string
  prefillMs: number
  decodeMs: number
  tokens: number
  tps: number
}

async function runGenerate(event: string, maxTokens: number, persona: Persona): Promise<GenResult> {
  const system = `${persona.intro}\n\n${SHARED_RULES}\n${persona.heatRule}`
  const messages = [{ role: 'system', content: system }, ...persona.fewshot, { role: 'user', content: `EVENT: ${event}` }]
  const inputs = tokenizer!.apply_chat_template(messages, {
    add_generation_prompt: true,
    return_dict: true,
  }) as { input_ids: unknown; attention_mask: unknown }

  let text = ''
  let tokens = 0
  let firstTokenAt = 0
  const t0 = performance.now()
  const streamer = new TextStreamer(tokenizer!, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (t: string) => {
      text += t
    },
    token_callback_function: () => {
      tokens++
      if (firstTokenAt === 0) firstTokenAt = performance.now()
    },
  })

  await (model as unknown as {
    generate(o: Record<string, unknown>): Promise<unknown>
  }).generate({
    ...inputs,
    max_new_tokens: maxTokens,
    do_sample: true,
    temperature: 0.85,
    top_k: 64,
    top_p: 0.95,
    streamer,
  })

  const t1 = performance.now()
  const prefillMs = firstTokenAt > 0 ? firstTokenAt - t0 : t1 - t0
  const decodeMs = firstTokenAt > 0 ? t1 - firstTokenAt : 0
  return {
    text,
    prefillMs: Math.round(prefillMs),
    decodeMs: Math.round(decodeMs),
    tokens,
    tps: decodeMs > 0 ? Math.round(((tokens - 1) / decodeMs) * 1000) : 0,
  }
}

// ---------- message pump ----------

self.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as MainToWorker
  if (msg.type === 'load') {
    void load()
    return
  }
  if (msg.type === 'generate') {
    if (!model || !tokenizer || busy) {
      post({ type: 'genfail', id: msg.id, message: busy ? 'busy' : 'not loaded' })
      return
    }
    busy = true
    const styleTokens: number = STYLE_TOKENS[msg.style as Style] ?? STYLE_TOKENS.standard
    runGenerate(msg.event, styleTokens, PERSONAS[msg.persona] ?? PERSONAS.max)
      .then((r) => post({ type: 'line', id: msg.id, ...r }))
      .catch((err) =>
        post({ type: 'genfail', id: msg.id, message: err instanceof Error ? err.message : String(err) })
      )
      .finally(() => {
        busy = false
      })
  }
})
