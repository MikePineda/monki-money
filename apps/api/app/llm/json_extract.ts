/**
 * Pulls the JSON answer out of a model's free text. Structured output is
 * "JSON in text" so it stays portable across Anthropic-compatible vendors
 * (no forced tool use, no `output_config.format`). Models still wrap the
 * JSON in code fences, prefix it with a sentence or append a comment, so:
 *
 * 1. inline `<think>...</think>` blocks are dropped (some vendors leak them);
 * 2. fenced blocks (```json ... ```) are tried first, in order;
 * 3. otherwise every balanced `{...}` / `[...]` candidate is tried in order
 *    and the first one that parses wins (quotes and escapes are respected,
 *    so braces inside strings never end a candidate).
 *
 * Validation of the parsed value is the caller's job (app/llm/schemas).
 */

export type JsonExtraction = { ok: true; value: unknown } | { ok: false; reason: string }

/** Upper bound of candidates tried, so pathological text stays linear-ish. */
const MAX_CANDIDATES = 20

const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi
const FENCED_BLOCK = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/g

export function extractJson(text: string): JsonExtraction {
  const cleaned = text.replace(THINK_BLOCK, '').trim()
  if (!cleaned) return { ok: false, reason: 'The answer was empty' }

  for (const match of cleaned.matchAll(FENCED_BLOCK)) {
    const found = firstParsableCandidate(match[1])
    if (found.ok) return found
  }

  const found = firstParsableCandidate(cleaned)
  if (found.ok) return found
  return { ok: false, reason: 'The answer did not contain a valid JSON object' }
}

function firstParsableCandidate(text: string): JsonExtraction {
  let from = 0
  for (let tries = 0; tries < MAX_CANDIDATES; tries++) {
    const start = nextOpening(text, from)
    if (start === -1) break

    const end = balancedEnd(text, start)
    if (end !== -1) {
      try {
        return { ok: true, value: JSON.parse(text.slice(start, end + 1)) }
      } catch {
        // Balanced but not JSON ("{placeholders}"): try the next candidate.
      }
    }
    from = start + 1
  }
  return { ok: false, reason: 'No parsable JSON candidate' }
}

function nextOpening(text: string, from: number): number {
  for (let index = from; index < text.length; index++) {
    if (text[index] === '{' || text[index] === '[') return index
  }
  return -1
}

/** Index of the bracket closing the one at `start`, or -1 when unbalanced. */
function balancedEnd(text: string, start: number): number {
  const stack: string[] = []
  let inString = false

  for (let index = start; index < text.length; index++) {
    const char = text[index]
    if (inString) {
      if (char === '\\') index++
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') stack.push('}')
    else if (char === '[') stack.push(']')
    else if (char === '}' || char === ']') {
      if (stack.pop() !== char) return -1
      if (stack.length === 0) return index
    }
  }
  return -1
}
