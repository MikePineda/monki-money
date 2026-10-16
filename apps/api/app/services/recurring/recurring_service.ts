import { inject } from '@adonisjs/core'
import type Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import RecurringItem from '#models/recurring_item'
import { FieldError } from '#exceptions/field_error'
import { findInHousehold } from '#repositories/scoped'
import { EDITABLE_FIELDS } from '#domain/recurring/redetection'
import { payeeMerchantKey } from '#domain/recurring/merchant_key'
import LedgerReferences from '#services/ledger/ledger_references'
import { DEFAULT_TOLERANCE_PCT } from '#domain/recurring/detection'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import RecurringDetector, { lockRecurringItems } from '#services/recurring/recurring_detector'
import type { CreateRecurringInput, UpdateRecurringInput } from '#services/recurring/dto'

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
    protected detector: RecurringDetector
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

  async create(household: Household, input: CreateRecurringInput) {
    const merchantKey = payeeMerchantKey(input.payee)
    if (merchantKey === '') throw new FieldError('payee', 'merchantKey')
    await this.assertReferences(household, input)

    return db.transaction(async (trx) => {
      await lockRecurringItems(household, trx)
      await this.assertUntracked(household, merchantKey, trx)
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
      const edited = EDITABLE_FIELDS.filter((field) => field in changed)
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

  protected async assertUntracked(
    household: Household,
    merchantKey: string,
    trx: TransactionClientContract
  ) {
    const existing = await RecurringItem.query({ client: trx })
      .where('household_id', household.id)
      .where('merchant_key', merchantKey)
      .first()
    if (existing) throw new FieldError('payee', 'taken')
  }

  protected async assertReferences(household: Household, input: UpdateRecurringInput) {
    if (input.categoryId)
      await this.references.categories(household, [input.categoryId], 'categoryId')
    if (input.accountId) await this.references.account(household, input.accountId)
    await this.references.payer(household, input.paidByUserId)
  }
}
