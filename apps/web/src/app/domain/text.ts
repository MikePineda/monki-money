/**
 * Text matching for search fields (select sheets, filters). Pure: no Angular.
 * Case and accents are ignored so "cafe" finds "Café" in both languages.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when every word of the query appears in the text. */
export function matchesSearch(text: string, query: string): boolean {
  const words = normalizeForSearch(query).split(' ').filter(Boolean)
  const haystack = normalizeForSearch(text)
  return words.every((word) => haystack.includes(word))
}
