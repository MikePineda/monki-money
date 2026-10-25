import type { TagRange } from '../../core/ledger/tags.api'
import { addMonths, yearOf, type YearMonth } from '../../domain/month'

/**
 * The date ranges the tags screens offer (`?period=` in their URL): every
 * date, the last twelve months, this calendar year or the one before.
 */
export const TAG_PERIODS = ['all', 'last12', 'thisYear', 'lastYear'] as const
export type TagPeriod = (typeof TAG_PERIODS)[number]

/** The period in a URL; anything unknown (or none) is every date. */
export function tagPeriodOf(value: string | null | undefined): TagPeriod {
  return (TAG_PERIODS as readonly string[]).includes(value ?? '') ? (value as TagPeriod) : 'all'
}

/**
 * The `from`/`to` dates of `period`, counted from `current` (this month in
 * the household's time zone). The last twelve months include this one and
 * stay open at the end.
 */
export function tagRangeOf(period: TagPeriod, current: YearMonth): TagRange {
  const year = yearOf(current)
  switch (period) {
    case 'all':
      return {}
    case 'last12':
      return { from: `${addMonths(current, -11)}-01` }
    case 'thisYear':
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    case 'lastYear':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
  }
}
