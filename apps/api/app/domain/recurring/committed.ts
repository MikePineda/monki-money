import type { RecurringCadence } from '@monkimoney/shared'
import { monthRange, type Month } from '#domain/calendar/month'
import { dueDatesBetween } from '#domain/recurring/cadence'
import { withinTolerance } from '#domain/recurring/detection'

/**
 * "Committed this month": what the household's active recurring payments
 * take from a month. Pure (no clock: `today` comes in).
 *
 * For each item, its due dates in the month are projected from
 * `nextExpectedDate` with its cadence (weekly rent falls due four or five
 * times). Its payments in the month (same merchant key, amount within the
 * item's tolerance) are what is already paid, and each covers one due
 * date, earliest first. The due dates left uncovered that fall from today
 * to the end of the month are what is still due; one already past and
 * unpaid is not counted. A past month has nothing still due; a future one
 * has every due date still due.
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
  categoryId: number | null
}

/** A payment of the month, as the matching needs it (amount spent, positive). */
export type MerchantPayment = {
  date: string
  amountCents: number
  merchantKey: string
}

/** A due date of the month: paid (the payment's date and amount) or still due. */
export type CommittedLine = {
  /** The recurring item. */
  id: number
  payee: string
  amountCents: number
  dueDate: string
  paid: boolean
  categoryId: number | null
}

export type Committed = {
  /** Paid this month by the active items. */
  paidCents: number
  /** Still due from today to the end of the month. */
  upcomingCents: number
  items: CommittedLine[]
}

function compareLines(a: CommittedLine, b: CommittedLine) {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
  if (a.paid !== b.paid) return a.paid ? -1 : 1
  if (a.payee !== b.payee) return a.payee < b.payee ? -1 : 1
  return a.id - b.id
}

export function committedInMonth(
  items: CommittedItem[],
  payments: MerchantPayment[],
  { month, today }: { month: Month; today: string }
): Committed {
  const { from, to } = monthRange(month)
  const stillDueFrom = today > from ? today : from
  const committed: Committed = { paidCents: 0, upcomingCents: 0, items: [] }

  for (const item of items) {
    const line = { id: item.id, payee: item.payee, categoryId: item.categoryId }
    const paid = payments
      .filter(
        (payment) =>
          payment.merchantKey === item.merchantKey &&
          payment.date >= from &&
          payment.date <= to &&
          withinTolerance(payment.amountCents, item.amountCents, item.amountTolerancePct)
      )
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    for (const payment of paid) {
      committed.paidCents += payment.amountCents
      committed.items.push({
        ...line,
        amountCents: payment.amountCents,
        dueDate: payment.date,
        paid: true,
      })
    }

    const uncovered = dueDatesBetween(item.nextExpectedDate, item.cadence, from, to).slice(
      paid.length
    )
    for (const dueDate of uncovered) {
      if (dueDate < stillDueFrom) continue
      committed.upcomingCents += item.amountCents
      committed.items.push({ ...line, amountCents: item.amountCents, dueDate, paid: false })
    }
  }

  committed.items.sort(compareLines)
  return committed
}
