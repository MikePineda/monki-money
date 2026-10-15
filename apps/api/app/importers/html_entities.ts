const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

const ENTITY = /&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,8});/gi

function fromCodePoint(codePoint: number, entity: string): string {
  const valid = codePoint > 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff)
  return valid ? String.fromCodePoint(codePoint) : entity
}

/**
 * Banks HTML-escape some text in their CSVs (`Us &amp; Friends`). Decodes
 * the common named entities and numeric references in a single pass, so
 * `&amp;lt;` becomes `&lt;` (never `<`). Unknown entities stay as written.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(ENTITY, (entity, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return fromCodePoint(Number.parseInt(body.slice(2), 16), entity)
    }
    if (body.startsWith('#')) return fromCodePoint(Number(body.slice(1)), entity)
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity
  })
}
