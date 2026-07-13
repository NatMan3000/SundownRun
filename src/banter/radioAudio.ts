// ============================================================
//  RADIO AUDIO - plays the hosts' voices through a car radio
// ------------------------------------------------------------
//  Own AudioContext, separate from the engine's (independent
//  volume, zero risk to the game mix). The chain gives the TTS a
//  broadcast character - highpass + lowpass shave it into the FM
//  band, a compressor keeps it punchy over engine noise - which
//  both sells the CALDERA FM fiction and flatters TTS artefacts.
//
//  Browsers block audio before the first user gesture; the game
//  always has one by the time a line plays (the intro is dismissed
//  by input), but if the context still refuses to run we just skip
//  the clip - the text chip already carries the line.
// ============================================================

import * as gameAudio from '../audio/AudioEngine'

const VOICE_VOL = 1.0

let ctx: AudioContext | null = null
let out: GainNode | null = null
let current: AudioBufferSourceNode | null = null
let speakingUntilMs = 0

function graph(): GainNode | null {
  if (ctx && out) return out
  try {
    ctx = new AudioContext()
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 220
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 4200
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -22
    comp.ratio.value = 7
    comp.attack.value = 0.004
    comp.release.value = 0.18
    const gain = ctx.createGain()
    gain.gain.value = VOICE_VOL
    hp.connect(lp)
    lp.connect(comp)
    comp.connect(gain)
    gain.connect(ctx.destination)
    out = hp as unknown as GainNode // entry node of the chain (typed loosely on purpose)
    return out
  } catch {
    return null
  }
}

/** True while a clip is playing - the director holds new dispatches meanwhile. */
export function speaking(): boolean {
  return performance.now() < speakingUntilMs
}

/**
 * Play one voice clip. Returns the clip duration in ms, or 0 when playback
 * was not possible (no context, suspended, bad buffer) - callers treat 0 as
 * "text-only moment".
 */
export function playVoice(pcm: Float32Array, sampleRate: number): number {
  const entry = graph()
  if (!ctx || !entry || pcm.length === 0) return 0
  if (ctx.state === 'suspended') void ctx.resume()
  if (ctx.state !== 'running') return 0

  // One host on air at a time - a new clip cuts the previous one short.
  if (current) {
    try {
      current.stop()
    } catch {
      // already stopped - fine
    }
  }

  const buf = ctx.createBuffer(1, pcm.length, sampleRate)
  buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(entry)
  current = src

  const durationMs = (pcm.length / sampleRate) * 1000
  speakingUntilMs = performance.now() + durationMs
  gameAudio.duckForRadio(true)
  src.onended = () => {
    if (current === src) current = null
    gameAudio.duckForRadio(false)
  }
  src.start()
  return durationMs
}
