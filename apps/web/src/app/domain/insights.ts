/**
 * Deterministic month insights: two short observations computed from the
 * month report and its trend (DESIGN.md, Month: "two insight cards"). Pure:
 * no Angular, no names. The page turns each insight into a sentence; LLM
 * insights later take the same slot.
 *
 * Amounts follow the report's convention: positive on their own side, so
 * a group's points are money spent.
 *
 * A closed month is compared with whole months. The month still running is
 * compared like with like: its histories are the same days of the previous
 * months (`sameDayHistories`, from the report's `previousMonthsToDate`), a
 * group with nothing spent so far is not news (the bill may simply not have
 * come yet), and the averages wait for the first week, when a single rent
 * or salary date moves the numbers too much. Those cards say "for the same
 * days" (the `*ToDate` kinds).
 */

/** Spend of one category group per month, oldest first; the last value is the month shown. */
export interface GroupHistory {
  groupId: number
  points: readonly number[]
}

export interface InsightInput {
  incomeCents: number
  expenseCents: number
  netCents: number
  groups: readonly GroupHistory[]
  /** Total spend per month, oldest first; the last value is the month shown. */
  spendHistory: readonly number[]
  /**
   * Set while the month is still running: the histories cover days 1 →
   * `throughDay` of every month (the last day counted in the previous one).
   */
  toDate?: { throughDay: number }
}

type GroupAverageKind =
  'groupAboveAverage' | 'groupBelowAverage' | 'groupAboveAverageToDate' | 'groupBelowAverageToDate'
type SpendAverageKind =
  'spendAboveAverage' | 'spendBelowAverage' | 'spendAboveAverageToDate' | 'spendBelowAverageToDate'

export type Insight =
  | { kind: GroupAverageKind; groupId: number; percent: number }
  | { kind: 'groupShare'; groupId: number; percent: number }
  | { kind: 'savedShare' | 'overspent'; percent: number }
  | { kind: SpendAverageKind; percent: number }

/** Months before the current one that make up "your average". */
export const AVERAGE_MONTHS = 3
/** A change smaller than this (in percent of the average) is not worth a card. */
export const MIN_CHANGE_PERCENT = 10
/** Averages under $50 swing too much to talk about. */
export const MIN_AVERAGE_CENTS = 5_000
/** The running month compares with averages from its seventh day on. */
export const MIN_DAYS_FOR_AVERAGE = 7

/** A line of the month report by group, as `byGroup` and `previousMonthsToDate` carry it. */
export interface GroupLine {
  bucket: string
  groupId: number | null
  kind: string
  amountCents: number
}

/** One month's spending and its group lines over the days that count. */
export interface MonthSpend {
  expenseCents: number
  byGroup: readonly GroupLine[]
}

/**
 * The running month's histories for {@link monthInsights}: each previous
 * month over the same days (oldest first), then the month so far. One
 * history per expense group seen in any of them, by group id.
 */
export function sameDayHistories(
  previousMonths: readonly MonthSpend[],
  current: MonthSpend
): Pick<InsightInput, 'groups' | 'spendHistory'> {
  const months = [...previousMonths, current]
  const spentByGroup = months.map((month) => {
    const spent = new Map<number, number>()
    for (const line of month.byGroup) {
      if (line.bucket === 'group' && line.kind === 'expense' && line.groupId !== null) {
        spent.set(line.groupId, line.amountCents)
      }
    }
    return spent
  })
  const groupIds = [...new Set(spentByGroup.flatMap((spent) => [...spent.keys()]))].sort(
    (a, b) => a - b
  )
  return {
    groups: groupIds.map((groupId) => ({
      groupId,
      points: spentByGroup.map((spent) => spent.get(groupId) ?? 0),
    })),
    spendHistory: months.map((month) => month.expenseCents),
  }
}

/** The mean of up to three values before the last one; null when there is none. */
export function previousAverage(points: readonly number[]): number | null {
  const previous = points.slice(0, -1).slice(-AVERAGE_MONTHS)
  if (previous.length === 0) {
    return null
  }
  return Math.round(previous.reduce((sum, value) => sum + value, 0) / previous.length)
}

/** The trend's expense group series as plain month values (the input of {@link monthInsights}). */
export function groupHistories(
  series: readonly {
    bucket: string
    id: number | null
    kind: string
    points: readonly { amountCents: number }[]
  }[]
): GroupHistory[] {
  return series
    .filter((line) => line.bucket === 'group' && line.kind === 'expense' && line.id !== null)
    .map((line) => ({
      groupId: line.id as number,
      points: line.points.map((point) => point.amountCents),
    }))
}

interface Change {
  current: number
  average: number
  delta: number
  percent: number
}

/**
 * The change of the last point against its average, when it is big enough
 * to mention. While the month runs, nothing spent so far is no change yet.
 */
function notableChange(points: readonly number[], running: boolean): Change | null {
  const average = previousAverage(points)
  const current = points.at(-1) ?? 0
  if (average === null || average < MIN_AVERAGE_CENTS || (running && current === 0)) {
    return null
  }
  const delta = current - average
  const percent = Math.round((Math.abs(delta) / average) * 100)
  return percent >= MIN_CHANGE_PERCENT ? { current, average, delta, percent } : null
}

function groupChange(groups: readonly GroupHistory[], running: boolean): Insight | null {
  let best: { groupId: number; change: Change } | null = null
  for (const group of groups) {
    const change = notableChange(group.points, running)
    if (!change) {
      continue
    }
    const better =
      best === null ||
      Math.abs(change.delta) > Math.abs(best.change.delta) ||
      (Math.abs(change.delta) === Math.abs(best.change.delta) && group.groupId < best.groupId)
    if (better) {
      best = { groupId: group.groupId, change }
    }
  }
  if (!best) {
    return null
  }
  const above = best.change.delta > 0
  return {
    kind: running
      ? above
        ? 'groupAboveAverageToDate'
        : 'groupBelowAverageToDate'
      : above
        ? 'groupAboveAverage'
        : 'groupBelowAverage',
    groupId: best.groupId,
    percent: best.change.percent,
  }
}

function incomeShare(input: InsightInput): Insight | null {
  if (input.incomeCents <= 0) {
    return null
  }
  const percent = Math.round((Math.abs(input.netCents) / input.incomeCents) * 100)
  return input.netCents >= 0 ? { kind: 'savedShare', percent } : { kind: 'overspent', percent }
}

function spendChange(history: readonly number[], running: boolean): Insight | null {
  const change = notableChange(history, running)
  if (!change) {
    return null
  }
  const above = change.delta > 0
  return {
    kind: running
      ? above
        ? 'spendAboveAverageToDate'
        : 'spendBelowAverageToDate'
      : above
        ? 'spendAboveAverage'
        : 'spendBelowAverage',
    percent: change.percent,
  }
}

function largestGroupShare(input: InsightInput): Insight | null {
  if (input.expenseCents <= 0) {
    return null
  }
  let best: { groupId: number; amount: number } | null = null
  for (const group of input.groups) {
    const amount = group.points.at(-1) ?? 0
    if (
      amount > 0 &&
      (best === null ||
        amount > best.amount ||
        (amount === best.amount && group.groupId < best.groupId))
    ) {
      best = { groupId: group.groupId, amount }
    }
  }
  if (!best) {
    return null
  }
  return {
    kind: 'groupShare',
    groupId: best.groupId,
    percent: Math.round((best.amount / input.expenseCents) * 100),
  }
}

/**
 * Up to two insights, always the same for the same numbers: the category
 * group that moved most against its 3-month average, then the share of
 * income saved (or overspent). When one is missing, total spend against
 * its average and then the largest group's share fill in. A running month
 * (`toDate`) uses same-day averages, and none before its seventh day.
 */
export function monthInsights(input: InsightInput, limit = 2): Insight[] {
  const running = input.toDate !== undefined
  const averages = !running || (input.toDate?.throughDay ?? 0) >= MIN_DAYS_FOR_AVERAGE
  const candidates = [
    averages ? groupChange(input.groups, running) : null,
    incomeShare(input),
    averages ? spendChange(input.spendHistory, running) : null,
    largestGroupShare(input),
  ]
  return candidates.filter((insight): insight is Insight => insight !== null).slice(0, limit)
}
