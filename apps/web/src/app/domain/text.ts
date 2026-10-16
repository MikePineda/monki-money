/**
 * Text matching for search fields (select sheets, filters). Pure: no Angular.
 * Case and accents are ignored so "cafe" finds "Café" in both languages; the
 * API keys payees the same way (`@monkimoney/shared`).
 */
import { normalizeForSearch } from '@monkimoney/shared'

export { normalizeForSearch }

/** True when every word of the query appears in the text. */
export function matchesSearch(text: string, query: string): boolean {
  const words = normalizeForSearch(query).split(' ').filter(Boolean)
  const haystack = normalizeForSearch(text)
  return words.every((word) => haystack.includes(word))
}
