/**
 * Deterministic month insights: two short observations computed from the
 * month report and its trend (DESIGN.md, Month: "two insight cards"). Pure:
 * no Angular, no names. The page turns each insight into a sentence; LLM
 * insights later take the same slot.
 *
 * Amounts follow the report's convention: positive on their own side, so
 * a group's points are money spent.
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
}

export type Insight =
  | { kind: 'groupAboveAverage' | 'groupBelowAverage'; groupId: number; percent: number }
  | { kind: 'groupShare'; groupId: number; percent: number }
  | { kind: 'savedShare' | 'overspent'; percent: number }
  | { kind: 'spendAboveAverage' | 'spendBelowAverage'; percent: number }

/** Months before the current one that make up "your average". */
export const AVERAGE_MONTHS = 3
/** A change smaller than this (in percent of the average) is not worth a card. */
export const MIN_CHANGE_PERCENT = 10
/** Averages under $50 swing too much to talk about. */
export const MIN_AVERAGE_CENTS = 5_000

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

/** The change of the last point against its average, when it is big enough to mention. */
function notableChange(points: readonly number[]): Change | null {
  const average = previousAverage(points)
  const current = points.at(-1) ?? 0
  if (average === null || average < MIN_AVERAGE_CENTS) {
    return null
  }
  const delta = current - average
  const percent = Math.round((Math.abs(delta) / average) * 100)
  return percent >= MIN_CHANGE_PERCENT ? { current, average, delta, percent } : null
}

function groupChange(groups: readonly GroupHistory[]): Insight | null {
  let best: { groupId: number; change: Change } | null = null
  for (const group of groups) {
    const change = notableChange(group.points)
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
  return {
    kind: best.change.delta > 0 ? 'groupAboveAverage' : 'groupBelowAverage',
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

function spendChange(history: readonly number[]): Insight | null {
  const change = notableChange(history)
  if (!change) {
    return null
  }
  return {
    kind: change.delta > 0 ? 'spendAboveAverage' : 'spendBelowAverage',
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
    if (amount > 0 && (best === null || amount > best.amount || (amount === best.amount && group.groupId < best.groupId))) {
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
 * its average and then the largest group's share fill in.
 */
export function monthInsights(input: InsightInput, limit = 2): Insight[] {
  const candidates = [
    groupChange(input.groups),
    incomeShare(input),
    spendChange(input.spendHistory),
    largestGroupShare(input),
  ]
  return candidates.filter((insight): insight is Insight => insight !== null).slice(0, limit)
}
