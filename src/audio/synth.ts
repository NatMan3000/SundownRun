// Low-level WebAudio primitives shared by the engine, the noise beds and the
// one-shot voices. Nothing here touches game state.

import { mulberry32 } from '../core/random'

/**
 * One shared white-noise bed. Deterministic (mulberry32, never Math.random) so a
 * recording of the game sounds the same twice. Two seconds is long enough that
 * the loop point is inaudible under a filter.
 */
export function makeNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const data = buf.getChannelData(0)
  const rnd = mulberry32(0x5c0de1)
  for (let i = 0; i < n; i++) data[i] = rnd() * 2 - 1
  return buf
}

/**
 * Soft-clip transfer curve, normalised so |x|=1 maps to 1. Feeding the summed
 * oscillators through this rounds the saw edges and grows harmonics as the mix
 * gets louder - which is exactly what a real exhaust does under load. Higher
 * `drive` = dirtier.
 */
export function makeWarmthCurve(drive: number, n = 2048) {
  // Backed by an explicit ArrayBuffer: WaveShaperNode.curve will not take the
  // SharedArrayBuffer-widened Float32Array that `new Float32Array(n)` infers.
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  const norm = Math.tanh(drive)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(drive * x) / norm
  }
  return curve
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Hermite ramp from 0 at `edge0` to 1 at `edge1`. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
