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

import type { Style } from './protocol'

/** Per-style length envelope - crazytown gets room, one-word gets almost none. */
const STYLE_CAPS: Record<Style, { min: number; max: number }> = {
  'one-word': { min: 2, max: 24 },
  standard: { min: 8, max: 90 },
  crazytown: { min: 8, max: 140 },
}

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

/**
 * Model refusal / assistant-voice leakage - never radio material. The
 * self-reference tells are matched anywhere; "I can't" style phrases only at
 * the line START, because mid-line they are enthusiasm ("I can't even
 * process the speed!"), not refusal - false-positive found live 2026-07-14.
 */
const REFUSAL = [/as an ai/i, /language model/i, /^(i'?m sorry|i apologi|i can'?t|i cannot|sorry, i)/i]

/**
 * Sanitise + judge one raw model output. Returns the line to display,
 * or null when the line must be dropped entirely.
 */
export function gateLine(raw: string, style: Style = 'standard'): string | null {
  const caps = STYLE_CAPS[style] ?? STYLE_CAPS.standard
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

  // Over-length or token-capped mid-word: keep whole sentences that fit, else
  // drop. One-worders are exempt from needing terminal punctuation ("FLYING"
  // is a complete thought at this length) - they only have to fit the cap.
  if (style === 'one-word') {
    if (s.length > caps.max) return null
  } else if (s.length > caps.max || !/[.!?]$/.test(s)) {
    let cut = -1
    const limit = Math.min(s.length, caps.max)
    for (let i = limit - 1; i >= 0; i--) {
      const c = s[i]
      if (c === '.' || c === '!' || c === '?') {
        cut = i
        break
      }
    }
    if (cut < 0) {
      // Crazytown run-ons routinely hit the token cap before any full stop -
      // and sometimes skip punctuation entirely (all-caps mania). Salvage
      // chain: last comma, else last space, then punch an exclamation on.
      // Cutting at a space drops at most one (possibly half) trailing word.
      if (style === 'crazytown') {
        const head = s.slice(0, caps.max)
        const comma = head.lastIndexOf(',')
        const space = head.lastIndexOf(' ')
        const at = comma >= 40 ? comma : space >= 60 ? space : -1
        if (at < 0) return null
        s = s.slice(0, at) + '!'
      } else {
        return null
      }
    } else {
      s = s.slice(0, cut + 1)
    }
  }

  if (s.length < caps.min) return null
  for (const r of REFUSAL) if (r.test(s)) return null
  if (BLOCKLIST.test(s)) return null
  return s
}
