import type { RecurringCadence } from '@monkimoney/shared'
import { addDays, daysBetween } from '#domain/importing/iso_days'
import { monthRange, type Month } from '#domain/calendar/month'
import { itemOfPayment } from '#domain/recurring/matching'
import { PAYMENT_WINDOW_DAYS, dueDatesBetween, stepsByDays } from '#domain/recurring/cadence'

/**
 * "Committed this month": what the household's active recurring payments
 * take from a month. Pure (no clock: `today` comes in).
 *
 * - Due dates are projected from `nextExpectedDate` with the item's cadence
 *   (weekly rent falls due four or five times), on the item's day of the
 *   month for month-based cadences, and never before an item typed by hand
 *   starts (no payment yet: nothing is due before its first date).
 * - A payment counts as the item's when its merchant key or its payee key
 *   names the item's key and its amount is within the item's tolerance;
 *   between several items of one merchant, the closest amount
 *   (app/domain/recurring/matching.ts).
 * - A due date is paid when one of those payments lands within the
 *   cadence's payment window of it (PAYMENT_WINDOW_DAYS), closest pairs
 *   first; a payment left over then pays the latest unpaid due date before
 *   it within twice the window (paid late). Payments are read from before
 *   the month, so a late payment for last month's due date never pays one
 *   of this month's.
 * - Current month: every due date of the month nobody paid is still due,
 *   flagged `overdue` when it is already past (often a bill whose bank
 *   export has not been imported yet). A past month has nothing still due;
 *   a future month has every due date still due.
 * - `paidCents` is every payment of the items dated in the month.
 */

/** An active recurring payment, as the month needs it. */
export type CommittedItem = {
  id: number
  payee: string
  merchantKey: string
  cadence: RecurringCadence
  amountCents: number
  amountTolerancePct: number
  nextExpectedDate: string
  /** null until a payment was seen (an item typed by hand). */
  lastPaidDate: string | null
  categoryId: number | null
}

/** A payment, as the matching needs it (amount spent, positive). */
export type MerchantPayment = {
  date: string
  amountCents: number
  merchantKey: string
  /** The payee's own key; '' when the payment has no payee. */
  payeeKey?: string
}

/** A due date of the month: paid (the payment's date and amount) or still due. */
export type CommittedLine = {
  /** The recurring item. */
  id: number
  payee: string
  amountCents: number
  dueDate: string
  paid: boolean
  /** Still due although its date is past (current month only). */
  overdue: boolean
  categoryId: number | null
}

export type Committed = {
  /** Paid this month by the active items. */
  paidCents: number
  /** Still due this month, overdue lines included. */
  upcomingCents: number
  items: CommittedLine[]
}

function compareLines(a: CommittedLine, b: CommittedLine) {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
  if (a.paid !== b.paid) return a.paid ? -1 : 1
  if (a.payee !== b.payee) return a.payee < b.payee ? -1 : 1
  return a.id - b.id
}

/** The item's day of the month: its last payment's when the next date was clamped to a short month. */
function dayOfMonth(item: CommittedItem): number | undefined {
  if (stepsByDays(item.cadence) || !item.lastPaidDate) return undefined
  const lastPaidDay = Number(item.lastPaidDate.slice(8, 10))
  const nextDay = Number(item.nextExpectedDate.slice(8, 10))
  const [year, month] = item.nextExpectedDate.split('-').map(Number)
  const endOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return nextDay === endOfMonth && lastPaidDay > nextDay ? lastPaidDay : undefined
}

/**
 * Payments paired with due dates: closest first within the payment window,
 * then a payment left over pays the latest unpaid due date before it within
 * twice the window (paid late, never early).
 */
function pairs(dueDates: string[], payments: MerchantPayment[], windowDays: number) {
  const candidates = dueDates.flatMap((dueDate, due) =>
    payments.map((payment, paid) => ({
      due,
      paid,
      distance: Math.abs(daysBetween(dueDate, payment.date)),
    }))
  )
  const covered = new Set<number>()
  const used = new Set<number>()
  for (const pair of candidates
    .filter((candidate) => candidate.distance <= windowDays)
    .sort((a, b) => a.distance - b.distance || a.due - b.due || a.paid - b.paid)) {
    if (covered.has(pair.due) || used.has(pair.paid)) continue
    covered.add(pair.due)
    used.add(pair.paid)
  }
  payments.forEach((payment, paid) => {
    if (used.has(paid)) return
    const late = dueDates
      .map((dueDate, due) => ({ due, lateBy: daysBetween(dueDate, payment.date) }))
      .filter(({ due, lateBy }) => !covered.has(due) && lateBy >= 0 && lateBy <= windowDays * 2)
      .sort((a, b) => a.lateBy - b.lateBy)[0]
    if (late) {
      covered.add(late.due)
      used.add(paid)
    }
  })
  return covered
}

export function committedInMonth(
  items: CommittedItem[],
  payments: MerchantPayment[],
  { month, today }: { month: Month; today: string }
): Committed {
  const { from, to } = monthRange(month)
  const committed: Committed = { paidCents: 0, upcomingCents: 0, items: [] }
  const past = today > to

  // Each payment belongs to one item at most (app/domain/recurring/matching.ts).
  const owned = new Map<number, MerchantPayment[]>()
  for (const payment of payments) {
    const item = itemOfPayment(payment, items)
    if (item) owned.set(item.id, [...(owned.get(item.id) ?? []), payment])
  }

  for (const item of items) {
    const line = { id: item.id, payee: item.payee, categoryId: item.categoryId }
    const window = PAYMENT_WINDOW_DAYS[item.cadence]
    const mine = (owned.get(item.id) ?? []).sort((a, b) => (a.date < b.date ? -1 : 1))

    for (const payment of mine.filter((entry) => entry.date >= from && entry.date <= to)) {
      committed.paidCents += payment.amountCents
      committed.items.push({
        ...line,
        amountCents: payment.amountCents,
        dueDate: payment.date,
        paid: true,
        overdue: false,
      })
    }
    if (past) continue

    // Due dates around the month too, so a payment pays the due date it is closest to.
    const starts = item.lastPaidDate === null ? item.nextExpectedDate : null
    const dueDates = dueDatesBetween(
      item.nextExpectedDate,
      item.cadence,
      addDays(from, -window),
      addDays(to, window),
      dayOfMonth(item)
    ).filter((dueDate) => starts === null || dueDate >= starts)
    const covered = pairs(dueDates, mine, window)

    dueDates.forEach((dueDate, index) => {
      if (covered.has(index) || dueDate < from || dueDate > to) return
      committed.upcomingCents += item.amountCents
      committed.items.push({
        ...line,
        amountCents: item.amountCents,
        dueDate,
        paid: false,
        overdue: dueDate < today,
      })
    })
  }

  committed.items.sort(compareLines)
  return committed
}
