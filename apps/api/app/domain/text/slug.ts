const MAX_SLUG_LENGTH = 60

/**
 * Stable kebab-case identifier from a display name ("Café & Té" -> "cafe-te").
 * Never empty: names made only of symbols become "item".
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')

  return slug || 'item'
}

/** `base`, or `base-2`, `base-3`... whichever is not taken yet. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  let counter = 2
  while (taken.has(`${base}-${counter}`)) counter++
  return `${base}-${counter}`
}
