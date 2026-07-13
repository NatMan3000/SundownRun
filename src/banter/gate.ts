// ============================================================
//  CONTENT GATE - nothing reaches the screen without passing here
// ------------------------------------------------------------
//  The model is prompted to be kid-appropriate, but prompts are a
//  request, not a guarantee. This gate is the guarantee: it runs on
//  every generated line BEFORE it renders, and its tiebreak is the
//  project's - appropriateness beats humour, every time. A rejected
//  line simply never appears; silence beats a bad line.
//
//  Pure functions, no imports - trivially testable from the console
//  via window.__banter.gate().
// ============================================================

export const MAX_LINE_CHARS = 90
const MIN_LINE_CHARS = 8

/**
 * Words that end a line's life regardless of context. Word-boundary matched,
 * case-insensitive. Deliberately over-broad ("hell", "die") - a dropped joke
 * costs nothing, a bad line on a 12-year-old's screen costs the feature.
 */
const BLOCKLIST = new RegExp(
  '\\b(' +
    [
      // profanity + crude
      'fuck\\w*', 'shit\\w*', 'bitch\\w*', 'bastard', 'asshole', 'arsehole',
      'dick', 'cock', 'piss\\w*', 'crap', 'damn', 'dammit', 'hell', 'wtf',
      'sexy', 'sex', 'naked', 'nude',
      // violence + dark
      'kill\\w*', 'die', 'dies', 'died', 'dying', 'dead', 'death', 'murder\\w*',
      'blood\\w*', 'gun', 'guns', 'shoot\\w*', 'stab\\w*', 'suicide',
      // substances
      'drug', 'drugs', 'beer', 'vodka', 'whiskey', 'drunk', 'cigarette\\w*', 'vape',
      // mean-spirited
      'stupid', 'idiot', 'dumb', 'loser', 'pathetic', 'hate', 'hates', 'sucks?',
    ].join('|') +
    ')\\b',
  'i'
)

/** Model refusal / assistant-voice leakage - never radio material. */
const REFUSAL = [/as an ai/i, /language model/i, /i can'?t/i, /i cannot/i, /i'?m sorry/i, /i apologi/i]

/**
 * Sanitise + judge one raw model output. Returns the line to display,
 * or null when the line must be dropped entirely.
 */
export function gateLine(raw: string): string | null {
  let s = raw.trim()

  // First line only, minus any self-labelling the model added.
  s = s.split('\n')[0].trim()
  s = s.replace(/^\s*(magma max|doc cinder|cinder|dj|caldera fm|radio)\s*[:>-]\s*/i, '')

  // Strip markdown furniture and normalise typography.
  s = s.replace(/[*_`#~]/g, '')
  s = s.replace(/[—–]/g, ' - ')
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  if (/^".*"$/.test(s)) s = s.slice(1, -1)

  // ASCII only - drops emoji and anything else exotic in one move.
  s = s.replace(/[^\x20-\x7E]/g, '')
  s = s.replace(/\s+/g, ' ').trim()

  // Over-length or token-capped mid-word: keep whole sentences that fit, else drop.
  if (s.length > MAX_LINE_CHARS || !/[.!?]$/.test(s)) {
    let cut = -1
    const limit = Math.min(s.length, MAX_LINE_CHARS)
    for (let i = limit - 1; i >= 0; i--) {
      const c = s[i]
      if (c === '.' || c === '!' || c === '?') {
        cut = i
        break
      }
    }
    if (cut < 0) return null
    s = s.slice(0, cut + 1)
  }

  if (s.length < MIN_LINE_CHARS) return null
  for (const r of REFUSAL) if (r.test(s)) return null
  if (BLOCKLIST.test(s)) return null
  return s
}
