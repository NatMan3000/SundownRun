/** m:ss.ttt - the only lap-time format in the game. */
export function formatLap(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '-:--.---'
  const clamped = Math.max(0, ms)
  const m = Math.floor(clamped / 60000)
  const s = Math.floor((clamped % 60000) / 1000)
  const t = Math.floor(clamped % 1000)
  return `${m}:${s < 10 ? '0' : ''}${s}.${t < 100 ? (t < 10 ? '00' : '0') : ''}${t}`
}
