/**
 * The Month view's numbers, built from the API's month and trend reports.
 * Pure: no Angular. Amounts follow the reports' convention (positive on
 * their own side: `expenseCents` is money spent, net of refunds).
 */
import type { BarListDatum } from './charts/bar-list'
import type { ChartColor } from './charts/colors'

export type DeltaDirection = 'up' | 'down' | 'flat'

/** Spend against the previous month: direction, size and whole percent (null without a base). */
export interface MonthDelta {
  direction: DeltaDirection
  cents: number
  percent: number | null
}

export function spendDelta(currentCents: number, previousCents: number): MonthDelta {
  const diff = currentCents - previousCents
  const direction: DeltaDirection = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
  const percent = previousCents > 0 ? Math.round((Math.abs(diff) / previousCents) * 100) : null
  return { direction, cents: Math.abs(diff), percent }
}

/** A line of the month report by group (`byGroup`). */
export interface GroupLineInput {
  bucket: string
  groupId: number | null
  kind: string
  amountCents: number
}

/** A line of the month report by category (`byCategory`). */
export interface CategoryLineInput extends GroupLineInput {
  categoryId: number | null
}

/** Names for the bar list, in the reader's language. */
export interface SpendLabels {
  group: (id: number) => string
  category: (id: number) => string
  uncategorized: string
  private: string
}

/**
 * "Spending by category" (DESIGN.md, Month-view charts): one bar per expense
 * group with its categories as expandable children, plus the uncategorised
 * and private buckets as muted "Other" rows that always sit last. Groups
 * whose refunds outweigh their spending have nothing to draw and are left out.
 */
export function spendByGroup(
  byGroup: readonly GroupLineInput[],
  byCategory: readonly CategoryLineInput[],
  labels: SpendLabels
): BarListDatum[] {
  const spent = (line: GroupLineInput) => line.kind === 'expense' && line.amountCents > 0
  return byGroup.filter(spent).map((line) => {
    if (line.bucket === 'group' && line.groupId !== null) {
      const children = byCategory
        .filter(
          (child) => spent(child) && child.bucket === 'category' && child.groupId === line.groupId
        )
        .map((child) => ({
          id: `category:${child.categoryId}`,
          label: labels.category(child.categoryId as number),
          valueCents: child.amountCents,
        }))
      return {
        id: `group:${line.groupId}`,
        label: labels.group(line.groupId),
        valueCents: line.amountCents,
        ...(children.length > 0 ? { children } : {}),
      }
    }
    const isPrivate = line.bucket === 'private'
    return {
      id: isPrivate ? 'private' : 'uncategorized',
      label: isPrivate ? labels.private : labels.uncategorized,
      valueCents: line.amountCents,
      other: true,
    }
  })
}

/** A line of the month report by person (`byPerson`). */
export interface PersonLineInput {
  bucket: string
  userId: number | null
  expenseCents: number
}

export interface PersonShare {
  id: 'you' | 'partner' | 'joint'
  label: string
  valueCents: number
  color: ChartColor
}

/** Who is who in the household, and each person's mark colour (the same on every screen). */
export interface PeopleInput {
  youId: number
  partnerId: number | null
  youColor?: ChartColor
  partnerColor?: ChartColor
}

/**
 * "Who paid" (DESIGN.md): you, the partner and the joint bucket (muted), in
 * that order, each person in their own mark colour. Empty when nothing was
 * spent.
 */
export function spendByPerson(
  byPerson: readonly PersonLineInput[],
  people: PeopleInput,
  labels: { you: string; partner: string; joint: string }
): PersonShare[] {
  let you = 0
  let partner = 0
  let joint = 0
  for (const line of byPerson) {
    if (line.bucket === 'joint' || line.userId === null) {
      joint += line.expenseCents
    } else if (line.userId === people.youId) {
      you += line.expenseCents
    } else {
      partner += line.expenseCents
    }
  }
  if (you + partner + joint <= 0) {
    return []
  }
  const shares: PersonShare[] = [
    { id: 'you', label: labels.you, valueCents: you, color: people.youColor ?? 'person-a' },
  ]
  if (people.partnerId !== null) {
    shares.push({
      id: 'partner',
      label: labels.partner,
      valueCents: partner,
      color: people.partnerColor ?? 'person-b',
    })
  }
  shares.push({ id: 'joint', label: labels.joint, valueCents: joint, color: 'muted' })
  return shares
}

/** One month of the trend report's totals. */
export interface MonthTotalsInput {
  month: string
  incomeCents: number
  expenseCents: number
  netCents: number
}

/** The 6-month trend as one series of money spent (the trend-line's data shape). */
export function spendTrend(
  totals: readonly MonthTotalsInput[],
  seriesId: string
): { x: string; series: { id: string; valueCents: number }[] }[] {
  return totals.map((month) => ({
    x: month.month,
    series: [{ id: seriesId, valueCents: month.expenseCents }],
  }))
}

/** One measure per month, oldest first (stat-tile sparklines). */
export function totalsSeries(
  totals: readonly MonthTotalsInput[],
  field: 'incomeCents' | 'expenseCents' | 'netCents'
): number[] {
  return totals.map((month) => month[field])
}
