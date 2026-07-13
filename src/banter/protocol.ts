// ============================================================
//  BANTER PROTOCOL - messages crossing the worker boundary
// ------------------------------------------------------------
//  The worker owns the model; the main thread owns scheduling
//  (director.ts decides WHEN a generation may fire). Both sides
//  import this file - keep it dependency-free.
// ============================================================

export type MainToWorker =
  | { type: 'load' }
  | { type: 'generate'; id: number; event: string; persona: string }

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
