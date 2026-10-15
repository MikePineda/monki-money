/**
 * Calendar months and dates. Pure: no Angular, no date libraries. A month is
 * the string 'YYYY-MM'; a transaction date is 'YYYY-MM-DD' with no time.
 * Month arithmetic is done on integers, never through local-time Date objects,
 * so the device time zone cannot shift a month.
 */

declare const yearMonthBrand: unique symbol

/** 'YYYY-MM', validated by {@link isYearMonth}. */
export type YearMonth = string & { readonly [yearMonthBrand]: true }

/** 'YYYY-MM-DD', a calendar date without time. */
export type IsoDate = string

const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isYearMonth(value: string): value is YearMonth {
  return YEAR_MONTH.test(value)
}

export function toYearMonth(year: number, month: number): YearMonth {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}` as YearMonth
}

function split(ym: YearMonth): { year: number; month: number } {
  return { year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)) }
}

export function yearOf(ym: YearMonth): number {
  return split(ym).year
}

/** The month a 'YYYY-MM-DD' date falls in. */
export function monthOf(date: IsoDate): YearMonth {
  const ym = date.slice(0, 7)
  if (!isYearMonth(ym)) {
    throw new RangeError(`Not a YYYY-MM-DD date: ${date}`)
  }
  return ym
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const { year, month } = split(ym)
  const index = year * 12 + (month - 1) + delta
  return toYearMonth(Math.floor(index / 12), (((index % 12) + 12) % 12) + 1)
}

/** Negative when `a` is earlier than `b`, zero when equal. */
export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Every month from `from` to `to`, both included. */
export function monthRange(from: YearMonth, to: YearMonth): YearMonth[] {
  const months: YearMonth[] = []
  for (let current = from; compareYearMonth(current, to) <= 0; current = addMonths(current, 1)) {
    months.push(current)
  }
  return months
}

export interface MonthLabelOptions {
  withYear?: boolean
  long?: boolean
}

/** "oct" / "Oct", "dic 2025" / "Dec 2025", "octubre" / "October". */
export function label(ym: YearMonth, locale: string, options: MonthLabelOptions = {}): string {
  const { year, month } = split(ym)
  const format = new Intl.DateTimeFormat(locale, {
    month: options.long ? 'long' : 'short',
    year: options.withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  })
  // Some locales add an abbreviation dot ("oct."); the design uses bare labels.
  return format.format(Date.UTC(year, month - 1, 1)).replace(/\.(?=\s|$)/g, '')
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

/**
 * Today's calendar date in a time zone, as 'YYYY-MM-DD'. The en-CA locale
 * formats dates as ISO year-month-day, which is why it is used here.
 */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  let format = dateFormatters.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    dateFormatters.set(timeZone, format)
  }
  return format.format(now)
}

/** The current month in a time zone. */
export function currentMonthIn(timeZone: string, now: Date = new Date()): YearMonth {
  return monthOf(todayIn(timeZone, now))
}
