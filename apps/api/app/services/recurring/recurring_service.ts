import Clock from '#services/clock'
import type User from '#models/user'
import { inject } from '@adonisjs/core'
import type Household from '#models/household'
import { todayIn } from '#domain/calendar/month'
import { addDays } from '#domain/importing/iso_days'
import { isHiddenFrom } from '#domain/ledger/privacy'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import MerchantPaymentsRepository from '#repositories/merchant_payments_repository'
import db from '@adonisjs/lucid/services/db'
import RecurringItem from '#models/recurring_item'
import { FieldError } from '#exceptions/field_error'
import { findInHousehold } from '#repositories/scoped'
import { EDITABLE_FIELDS } from '#domain/recurring/redetection'
import { payeeMerchantKey } from '#domain/recurring/merchant_key'
import LedgerReferences from '#services/ledger/ledger_references'
import { itemOfPayment } from '#domain/recurring/matching'
import { DEFAULT_TOLERANCE_PCT, withinTolerance } from '#domain/recurring/detection'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import RecurringDetector, { lockRecurringItems } from '#services/recurring/recurring_detector'
import type {
  CreateRecurringInput,
  MerchantSuggestion,
  UpdateRecurringInput,
} from '#services/recurring/dto'

/** How far back the merchants offered when adding an item by hand go. */
const SUGGESTION_DAYS = 120
/** At most this many merchants are offered. */
const MAX_SUGGESTIONS = 40

/**
 * Recurring payments of the current household (any member): the list,
 * items typed by hand, a person's edits (pause, resume, dismiss included)
 * and detection on demand. Ids in the path are household-scoped (404) and
 * ids in the body must belong to the household (422).
 */
@inject()
export default class RecurringService {
  constructor(
    protected references: LedgerReferences,
    protected detector: RecurringDetector,
    protected payments: MerchantPaymentsRepository,
    protected clock: Clock
  ) {}

  /** Active items first, then paused, then dismissed; each by next due date. */
  list(household: Household) {
    return RecurringItem.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .orderBy('status')
      .orderBy('next_expected_date')
      .orderBy('id')
  }

  detect(household: Household) {
    return this.detector.detect(household)
  }

  /**
   * The merchants the household paid in the last months whose payments no
   * item pays yet (a merchant with one tracked line still offers another
   * amount), most paid first: adding one of them keys the item like the
   * bank's rows. A partner's private purchases are never offered.
   */
  async merchants(household: Household, viewer: User): Promise<MerchantSuggestion[]> {
    const today = todayIn(this.clock.now(), household.timezone)
    const reader = await privacyViewer(household, viewer)
    const payments = await this.payments.between(household, addDays(today, -SUGGESTION_DAYS), today)
    const tracked = await RecurringItem.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .select('id', 'merchant_key', 'amount_cents', 'amount_tolerance_pct')

    const byKey = new Map<string, MerchantSuggestion>()
    for (const payment of payments) {
      // A payment an item already pays (by bank key, payee key or name, and amount) is tracked.
      if (!payment.merchantKey || itemOfPayment(payment, tracked)) continue
      if (isHiddenFrom(payment, reader)) continue
      const entry = byKey.get(payment.merchantKey)
      byKey.set(payment.merchantKey, {
        merchantKey: payment.merchantKey,
        payee: payment.payee?.trim() || entry?.payee || payment.merchantKey,
        amountCents: payment.amountCents,
        lastPaidDate: payment.date,
        count: (entry?.count ?? 0) + 1,
      })
    }
    return [...byKey.values()]
      .sort(
        (a, b) =>
          b.count - a.count ||
          (a.lastPaidDate < b.lastPaidDate ? 1 : a.lastPaidDate > b.lastPaidDate ? -1 : 0) ||
          (a.payee < b.payee ? -1 : 1)
      )
      .slice(0, MAX_SUGGESTIONS)
  }

  async create(household: Household, input: CreateRecurringInput) {
    const merchantKey = input.merchantKey || payeeMerchantKey(input.payee)
    if (merchantKey === '') throw new FieldError('payee', 'merchantKey')
    await this.assertReferences(household, input)

    return db.transaction(async (trx) => {
      await lockRecurringItems(household, trx)
      await this.assertUntracked(household, merchantKey, input.amountCents, trx)
      return RecurringItem.create(
        {
          householdId: household.id,
          merchantKey,
          payee: input.payee,
          cadence: input.cadence,
          amountCents: input.amountCents,
          amountTolerancePct: input.amountTolerancePct ?? DEFAULT_TOLERANCE_PCT,
          nextExpectedDate: input.nextExpectedDate,
          categoryId: input.categoryId ?? null,
          accountId: input.accountId ?? null,
          paidByUserId: input.paidByUserId ?? null,
          lastPaidDate: null,
          occurrences: 0,
          status: 'active',
          source: 'manual',
          editedFields: [],
        },
        { client: trx }
      )
    })
  }

  /** Changes what was sent and remembers it as a person's edit (detection keeps it). */
  async update(household: Household, itemId: number, input: UpdateRecurringInput) {
    await findInHousehold(RecurringItem, household, itemId)
    await this.assertReferences(household, input)

    return db.transaction(async (trx) => {
      await lockRecurringItems(household, trx)
      const item = await RecurringItem.query({ client: trx })
        .where('household_id', household.id)
        .where('id', itemId)
        .firstOrFail()

      const { status, ...fields } = input
      const changed = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined)
      )
      // A status a person chose is an edit too: detection never pauses or resumes it.
      const edited = EDITABLE_FIELDS.filter(
        (field) => field in changed || (field === 'status' && status !== undefined)
      )
      item.merge({
        ...changed,
        ...(status ? { status } : {}),
        editedFields: [...new Set([...item.editedFields, ...edited])],
      })
      await item.save()
      return item
    })
  }

  /** Forgets the item; a detected one may be found again (dismiss it to keep it away). */
  async destroy(household: Household, itemId: number) {
    const item = await findInHousehold(RecurringItem, household, itemId)
    await item.delete()
  }

  /**
   * One merchant may have several items (two phone lines) but not the same
   * bill twice: an item under the key whose amount is within its tolerance
   * of the new one is 422 `payee`/`taken`.
   */
  protected async assertUntracked(
    household: Household,
    merchantKey: string,
    amountCents: number,
    trx: TransactionClientContract
  ) {
    const existing = await RecurringItem.query({ client: trx })
      .where('household_id', household.id)
      .where('merchant_key', merchantKey)
    if (
      existing.some((item) =>
        withinTolerance(amountCents, item.amountCents, item.amountTolerancePct)
      )
    ) {
      throw new FieldError('payee', 'taken')
    }
  }

  protected async assertReferences(household: Household, input: UpdateRecurringInput) {
    if (input.categoryId)
      await this.references.categories(household, [input.categoryId], 'categoryId')
    if (input.accountId) await this.references.account(household, input.accountId)
    await this.references.payer(household, input.paidByUserId)
  }
}
