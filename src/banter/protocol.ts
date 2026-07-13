// ============================================================
//  BANTER PROTOCOL - messages crossing the worker boundary
// ------------------------------------------------------------
//  The worker owns the model; the main thread owns scheduling
//  (director.ts decides WHEN a generation may fire). Both sides
//  import this file - keep it dependency-free.
// ============================================================

/**
 * Delivery shape of a line. The model mirrors whatever rhythm its few-shot
 * shows, so form must be an explicit routed dimension or every line comes
 * out as the same two short sentences (Nathan, 2026-07-14).
 */
export type Style = 'one-word' | 'standard' | 'crazytown'

export type MainToWorker =
  | { type: 'load'; voice: boolean }
  | { type: 'generate'; id: number; event: string; persona: string; style: Style }
  | { type: 'speak'; id: number; text: string; voice: string; speed: number }

export type WorkerToMain =
  | { type: 'progress'; loadedMB: number; totalMB: number; pct: number }
  | { type: 'ready'; loadMs: number; warmupMs: number }
  | { type: 'unavailable'; reason: string }
  | {
      type: 'line'
      id: number
      /** Raw model output - the content gate on the main thread has NOT run yet. */
      text: string
      /** Time to first generated token (prompt prefill + one decode step). */
      prefillMs: number
      /** Wall time spent decoding after the first token. */
      decodeMs: number
      tokens: number
      /** Decode tokens per second (excludes prefill). */
      tps: number
    }
  | { type: 'genfail'; id: number; message: string }
  | { type: 'voiceready'; loadMs: number }
  | { type: 'voiceunavailable'; reason: string }
  | { type: 'speech'; id: number; audio: Float32Array; sampleRate: number; synthMs: number }
  | { type: 'speechfail'; id: number; message: string }
