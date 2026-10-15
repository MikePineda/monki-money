/**
 * A small ICU MessageFormat subset for the catalogues, built on Intl
 * (PluralRules and NumberFormat) instead of a full MessageFormat compiler:
 *
 *   {name}                                 argument
 *   {n, number}                            locale-formatted number
 *   {n, plural, offset:1 =0 {..} one {# ..} other {..}}
 *   {n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}
 *   {key, select, a {..} b {..} other {..}}
 *
 * `#` inside a plural is the (offset) number, formatted for the locale.
 * Apostrophes follow ICU: `''` is one apostrophe, `'{...}'` quotes syntax,
 * any other apostrophe is literal ("your bank's CSV").
 *
 * Pure TypeScript, no Angular. A malformed message renders as written.
 */

export type IcuParams = Record<string, unknown>

type Part =
  | string
  | { kind: 'arg'; name: string }
  | { kind: 'number'; name: string }
  | { kind: 'pound' }
  | { kind: 'plural'; name: string; ordinal: boolean; offset: number; options: Map<string, Part[]> }
  | { kind: 'select'; name: string; options: Map<string, Part[]> }

class IcuSyntaxError extends Error {}

class Parser {
  private index = 0

  constructor(private readonly source: string) {}

  parse(): Part[] {
    const parts = this.message(false, 0)
    if (this.index < this.source.length) {
      throw new IcuSyntaxError(`Unexpected "}" at ${this.index}`)
    }
    return parts
  }

  private message(inPlural: boolean, depth: number): Part[] {
    const parts: Part[] = []
    let text = ''
    const flush = (): void => {
      if (text) {
        parts.push(text)
        text = ''
      }
    }
    while (this.index < this.source.length) {
      const char = this.source[this.index]
      if (char === "'") {
        text += this.apostrophe(inPlural)
      } else if (char === '{') {
        flush()
        this.index++
        parts.push(this.argument(inPlural, depth + 1))
      } else if (char === '}') {
        if (depth === 0) {
          throw new IcuSyntaxError(`Unbalanced "}" at ${this.index}`)
        }
        break
      } else if (char === '#' && inPlural) {
        flush()
        parts.push({ kind: 'pound' })
        this.index++
      } else {
        text += char
        this.index++
      }
    }
    flush()
    return parts
  }

  private apostrophe(inPlural: boolean): string {
    const next = this.source[this.index + 1]
    if (next === "'") {
      this.index += 2
      return "'"
    }
    if (next === '{' || next === '}' || (next === '#' && inPlural)) {
      let quoted = ''
      this.index++
      while (this.index < this.source.length) {
        const char = this.source[this.index]
        if (char === "'") {
          if (this.source[this.index + 1] === "'") {
            quoted += "'"
            this.index += 2
            continue
          }
          this.index++
          return quoted
        }
        quoted += char
        this.index++
      }
      return quoted
    }
    this.index++
    return "'"
  }

  private argument(inPlural: boolean, depth: number): Part {
    const name = this.word()
    this.whitespace()
    if (this.eat('}')) {
      return { kind: 'arg', name }
    }
    this.expect(',')
    const type = this.word()
    this.whitespace()
    switch (type) {
      case 'number': {
        // An optional style (", integer") is accepted and ignored.
        while (this.index < this.source.length && this.source[this.index] !== '}') {
          this.index++
        }
        this.expect('}')
        return { kind: 'number', name }
      }
      case 'plural':
      case 'selectordinal': {
        this.expect(',')
        const { offset, options } = this.options(true, depth, true)
        return { kind: 'plural', name, ordinal: type === 'selectordinal', offset, options }
      }
      case 'select': {
        this.expect(',')
        return { kind: 'select', name, options: this.options(inPlural, depth, false).options }
      }
      default:
        throw new IcuSyntaxError(`Unknown argument type "${type}"`)
    }
  }

  private options(
    inPlural: boolean,
    depth: number,
    allowOffset: boolean
  ): { offset: number; options: Map<string, Part[]> } {
    const options = new Map<string, Part[]>()
    let offset = 0
    for (;;) {
      this.whitespace()
      if (this.eat('}')) {
        break
      }
      const selector = this.word()
      if (allowOffset && options.size === 0 && selector.startsWith('offset:')) {
        offset = Number(selector.slice('offset:'.length))
        continue
      }
      this.whitespace()
      this.expect('{')
      const branch = this.message(inPlural, depth + 1)
      this.expect('}')
      options.set(selector, branch)
    }
    if (options.size === 0) {
      throw new IcuSyntaxError('An argument needs at least one option')
    }
    return { offset, options }
  }

  private word(): string {
    this.whitespace()
    const start = this.index
    while (this.index < this.source.length && !/[\s,{}]/.test(this.source[this.index] ?? '')) {
      this.index++
    }
    if (start === this.index) {
      throw new IcuSyntaxError(`Expected a name at ${this.index}`)
    }
    return this.source.slice(start, this.index)
  }

  private whitespace(): void {
    while (/\s/.test(this.source[this.index] ?? '')) {
      this.index++
    }
  }

  private eat(char: string): boolean {
    if (this.source[this.index] === char) {
      this.index++
      return true
    }
    return false
  }

  private expect(char: string): void {
    this.whitespace()
    if (!this.eat(char)) {
      throw new IcuSyntaxError(`Expected "${char}" at ${this.index}`)
    }
  }
}

const parsed = new Map<string, Part[] | null>()

function parse(message: string): Part[] | null {
  if (!parsed.has(message)) {
    try {
      parsed.set(message, new Parser(message).parse())
    } catch {
      parsed.set(message, null)
    }
  }
  return parsed.get(message) ?? null
}

function render(parts: Part[], params: IcuParams, locale: string, pound: number | null): string {
  let out = ''
  for (const part of parts) {
    if (typeof part === 'string') {
      out += part
      continue
    }
    switch (part.kind) {
      case 'arg': {
        const value = params[part.name]
        out += value === undefined || value === null ? '' : String(value)
        break
      }
      case 'number':
        out += new Intl.NumberFormat(locale).format(Number(params[part.name]))
        break
      case 'pound':
        out += pound === null ? '#' : new Intl.NumberFormat(locale).format(pound)
        break
      case 'plural': {
        const value = Number(params[part.name])
        const shifted = value - part.offset
        const category = new Intl.PluralRules(locale, {
          type: part.ordinal ? 'ordinal' : 'cardinal',
        }).select(shifted)
        const branch =
          part.options.get(`=${value}`) ?? part.options.get(category) ?? part.options.get('other')
        out += branch ? render(branch, params, locale, shifted) : ''
        break
      }
      case 'select': {
        const branch = part.options.get(String(params[part.name])) ?? part.options.get('other')
        out += branch ? render(branch, params, locale, pound) : ''
        break
      }
    }
  }
  return out
}

/** Formats an ICU message for a locale (es-MX, en-AU). */
export function formatIcuMessage(message: string, params: IcuParams, locale: string): string {
  const parts = parse(message)
  return parts ? render(parts, params, locale, null) : message
}
