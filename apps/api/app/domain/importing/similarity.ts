/**
 * Text similarity between what a person typed (a payee such as "FreshCo")
 * and what the bank wrote ("FRESHCO MARKET NORTHVALE"): Jaro-Winkler per
 * token, best match per typed token, averaged (Monge-Elkan).
 */

/** Words that carry no merchant identity. */
const NOISE_WORDS = new Set(['pty', 'ltd', 'the', 'and', 'of', 'pos', 'eftpos', 'online', 'au'])

/** Token pairs below this Jaro-Winkler score count as unrelated (short words match by chance). */
export const MIN_TOKEN_SIMILARITY = 0.8

/** Jaro-Winkler similarity of two tokens (ASCII, see `tokenize`): 0 (nothing in common) to 1 (identical). */
export function jaroWinkler(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0
  if (a === b) return 1

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aMatched = new Array<boolean>(a.length).fill(false)
  const bMatched = new Array<boolean>(b.length).fill(false)
  let matches = 0

  for (const [i, char] of [...a].entries()) {
    const end = Math.min(b.length - 1, i + window)
    for (let j = Math.max(0, i - window); j <= end; j++) {
      if (!bMatched[j] && char === b[j]) {
        aMatched[i] = true
        bMatched[j] = true
        matches++
        break
      }
    }
  }
  if (matches === 0) return 0

  let transpositions = 0
  let k = 0
  for (const [i, char] of [...a].entries()) {
    if (!aMatched[i]) continue
    while (!bMatched[k]) k++
    if (char !== b[k]) transpositions++
    k++
  }

  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3
  let prefix = 0
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  return jaro + prefix * 0.1 * (1 - jaro)
}

/** Lowercase ASCII words, without numbers, single letters or noise words. */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !/\d/.test(token) && !NOISE_WORDS.has(token))
}

/**
 * How much of `query` (typed by a person) appears in `target` (written by
 * the bank): for every distinct query token, its best Jaro-Winkler score
 * against the target tokens (0 under `MIN_TOKEN_SIMILARITY`), averaged.
 */
export function tokenSimilarity(query: string, target: string): number {
  const queryTokens = [...new Set(tokenize(query))]
  const targetTokens = [...new Set(tokenize(target))]
  if (queryTokens.length === 0 || targetTokens.length === 0) return 0

  const total = queryTokens.reduce((sum, token) => {
    const best = Math.max(...targetTokens.map((candidate) => jaroWinkler(token, candidate)))
    return sum + (best >= MIN_TOKEN_SIMILARITY ? best : 0)
  }, 0)
  return total / queryTokens.length
}
