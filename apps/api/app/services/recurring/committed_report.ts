import { inject } from '@adonisjs/core'
import type Household from '#models/household'
import RecurringItem from '#models/recurring_item'
import { isHiddenFrom, type PrivacyViewer } from '#domain/ledger/privacy'
import { addDays } from '#domain/importing/iso_days'
import { monthRange, type Month } from '#domain/calendar/month'
import { MAX_PAYMENT_WINDOW_DAYS } from '#domain/recurring/cadence'
import { committedInMonth, type Committed } from '#domain/recurring/committed'
import MerchantPaymentsRepository from '#repositories/merchant_payments_repository'

/** The `committed` block of `GET /reports/month`. */
export type CommittedReport = Committed & {
  /** Items the household tracks (active or paused): 0 = nothing detected or added yet. */
  recurringCount: number
}

/**
 * "Committed this month" for the Month view: the active recurring items,
 * what of them is already paid in the month and what is still due until
 * its end (app/domain/recurring/committed.ts). A partner's private payment
 * never counts as paid for the reader (its details are not theirs to see).
 * With `paidByUserId`, only that person's items and payments count.
 */
@inject()
export default class CommittedReportBuilder {
  constructor(protected payments: MerchantPaymentsRepository) {}

  async forMonth(
    household: Household,
    viewer: PrivacyViewer,
    { month, today, paidByUserId }: { month: Month; today: string; paidByUserId?: number }
  ): Promise<CommittedReport> {
    const tracked = await RecurringItem.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .whereNot('status', 'dismissed')
    const active = tracked.filter(
      (item) =>
        item.status === 'active' &&
        (paidByUserId === undefined || item.paidByUserId === paidByUserId)
    )
    if (active.length === 0) {
      return { paidCents: 0, upcomingCents: 0, items: [], recurringCount: tracked.length }
    }

    const { from, to } = monthRange(month)
    // From before the month too: a late payment pays last month's due date, not this month's.
    const around = await this.payments.between(
      household,
      addDays(from, -MAX_PAYMENT_WINDOW_DAYS),
      to
    )
    const payments = around.filter(
      (payment) =>
        !isHiddenFrom(payment, viewer) &&
        (paidByUserId === undefined || payment.paidByUserId === paidByUserId)
    )
    return {
      ...committedInMonth(active, payments, { month, today }),
      recurringCount: tracked.length,
    }
  }
}
