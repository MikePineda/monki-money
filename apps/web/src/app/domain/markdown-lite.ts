/**
 * A tiny Markdown subset for model-written text (the monthly insight body):
 * paragraphs, `**strong**` runs and `- ` / `* ` lists, plus `#` headings
 * read as a strong paragraph. Pure: the result is a structured model that
 * templates render with interpolation, so raw HTML in the input is only
 * ever text (never parsed, never bound as HTML). Anything else is kept as
 * typed.
 */

export interface MarkdownSpan {
  text: string
  strong: boolean
}

export type MarkdownBlock =
  { kind: 'paragraph'; spans: MarkdownSpan[] } | { kind: 'list'; items: MarkdownSpan[][] }

const BULLET = /^\s*[-*]\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/
const STRONG = '**'

/** Splits one line of text into plain and `**strong**` runs; an unclosed marker stays literal. */
export function inlineSpans(text: string): MarkdownSpan[] {
  const spans: MarkdownSpan[] = []
  const push = (value: string, strong: boolean) => {
    if (value === '') {
      return
    }
    const last = spans.at(-1)
    if (last && last.strong === strong) {
      last.text += value
    } else {
      spans.push({ text: value, strong })
    }
  }

  let rest = text
  while (rest !== '') {
    const open = rest.indexOf(STRONG)
    const close = open === -1 ? -1 : rest.indexOf(STRONG, open + STRONG.length)
    if (open === -1 || close === -1) {
      push(rest, false)
      break
    }
    push(rest.slice(0, open), false)
    push(rest.slice(open + STRONG.length, close), true)
    rest = rest.slice(close + STRONG.length)
  }
  return spans
}

/** Parses the subset into blocks; blank input gives no blocks. */
export function parseMarkdownLite(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []
  let list: MarkdownSpan[][] | null = null

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', spans: inlineSpans(paragraph.join(' ')) })
      paragraph = []
    }
  }
  const flushList = () => {
    if (list) {
      blocks.push({ kind: 'list', items: list })
      list = null
    }
  }

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (line === '') {
      flushParagraph()
      flushList()
      continue
    }
    const bullet = BULLET.exec(raw)
    if (bullet) {
      flushParagraph()
      list ??= []
      list.push(inlineSpans((bullet[1] ?? '').trim()))
      continue
    }
    flushList()
    const heading = HEADING.exec(raw)
    if (heading) {
      flushParagraph()
      blocks.push({ kind: 'paragraph', spans: [{ text: (heading[1] ?? '').trim(), strong: true }] })
      continue
    }
    paragraph.push(line)
  }
  flushParagraph()
  flushList()
  return blocks
}
