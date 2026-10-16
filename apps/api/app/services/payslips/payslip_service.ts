import type User from '#models/user'
import { inject } from '@adonisjs/core'
import Payslip from '#models/payslip'
import Category from '#models/category'
import Transfer from '#models/transfer'
import type Account from '#models/account'
import type Household from '#models/household'
import Transaction from '#models/transaction'
import db from '@adonisjs/lucid/services/db'
import { payslipNetCents } from '@monkimoney/shared'
import { FieldError } from '#exceptions/field_error'
import { PrivateTransaction } from '#exceptions/errors'
import { isHiddenFrom } from '#domain/ledger/privacy'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import { findInHousehold } from '#repositories/scoped'
import TransferService from '#services/ledger/transfer_service'
import LedgerReferences from '#services/ledger/ledger_references'
import { isUniqueViolationOn } from '#services/ledger/unique_violation'
import { assertMemberOf } from '#services/households/membership_lookup'
import { householdIdOf, type HouseholdRef } from '#models/mixins/household_scoped'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { CreatePayslipInput, PayslipCandidate, PayslipFilters } from '#services/payslips/dto'

/** Partial unique index of the payslips migration: one payslip per transfer. */
const TRANSFER_CONSTRAINT = 'payslips_transfer_id_unique'
/** Partial unique index of the payslips migration: one payslip per (household, client_id). */
const CLIENT_ID_CONSTRAINT = 'payslips_household_client_id_unique'

/** The household category the gross income goes to (null when the household removed it). */
const GROSS_CATEGORY_SLUG = 'salary'

/** Candidate transfers offered at most (newest first). */
const CANDIDATE_LIMIT = 50

/**
 * Payslips: a payout recorded in the account it arrived in as one income
 * row (the gross, category `salary`) and one expense row per deduction,
 * all pointing at the payslip, plus the link to the transfer that took the
 * net out (an existing one, or one created here). Everything is written in
 * one DB transaction and `gross - deductions = net = transfer amount`
 * always holds (422 otherwise); a repeated `clientId` returns the payslip
 * it recorded. There is no update: a payslip is deleted (its rows go, the
 * transfer stays and becomes a candidate again) and recorded again. A
 * linked transfer keeps its amount and source account (TransferService).
 */
@inject()
export default class PayslipService {
  constructor(
    protected references: LedgerReferences,
    protected transfers: TransferService
  ) {}

  /** Newest first, with their rows and the linked transfer. */
  list(household: HouseholdRef, filters: PayslipFilters = {}) {
    return Payslip.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .if(filters.accountId, (query) => query.where('account_id', filters.accountId!))
      .orderBy('date', 'desc')
      .orderBy('id', 'desc')
      .preload('lines', (lines) => lines.orderBy('id'))
      .preload('transfer')
  }

  async find(household: HouseholdRef, payslipId: number) {
    const payslip = await findInHousehold(Payslip, household, payslipId)
    await payslip.load('lines', (lines) => lines.orderBy('id'))
    await payslip.load('transfer')
    return payslip
  }

  /** Transfers leaving `accountId` that no payslip explains yet, newest first. */
  async candidates(household: HouseholdRef, accountId: number): Promise<PayslipCandidate[]> {
    const transfers = await Transfer.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('from_account_id', accountId)
      .whereNotExists((linked) =>
        linked.from('payslips').whereColumn('payslips.transfer_id', 'transfers.id').select('id')
      )
      .orderBy('date', 'desc')
      .orderBy('id', 'desc')
      .limit(CANDIDATE_LIMIT)

    return transfers.map((transfer) => ({
      transferId: transfer.id,
      date: transfer.date,
      amountCents: transfer.amountCents,
      toAccountId: transfer.toAccountId,
      memo: transfer.memo,
    }))
  }

  /**
   * Records the payout. With a `clientId` already used in the household,
   * returns that payslip instead (`created: false`), even when the retry
   * races the first request.
   */
  async create(
    household: Household,
    actor: User,
    input: CreatePayslipInput
  ): Promise<{ payslip: Payslip; created: boolean }> {
    if (input.clientId) {
      const existing = await this.findByClientId(household, input.clientId)
      if (existing) return { payslip: existing, created: false }
    }

    const account = await this.references.account(household, input.accountId)
    await this.references.categories(
      household,
      input.deductions.map((line) => line.categoryId),
      'deductions'
    )
    await this.assertExpenseCategories(household, input)
    if (typeof input.userId === 'number') await assertMemberOf(household, input.userId, 'userId')
    const userId = input.userId === undefined ? account.ownerUserId : input.userId

    const netCents = payslipNetCents(
      input.grossCents,
      input.deductions.map((line) => line.amountCents)
    )
    if (netCents <= 0) throw new FieldError('deductions', 'exceedsGross')

    if (input.transferId !== undefined && input.toAccountId !== undefined) {
      throw new FieldError('toAccountId', 'exclusive')
    }
    if (input.transferId === undefined && input.toAccountId === undefined) {
      throw new FieldError('transferId', 'required')
    }
    const target =
      input.toAccountId === undefined
        ? null
        : await this.transfers.accounts(household, account.id, input.toAccountId)
    const grossCategoryId = await this.grossCategoryId(household)

    try {
      const payslipId = await db.transaction(async (trx) => {
        const transfer = target
          ? await this.transfers.insert(
              household,
              actor,
              { date: input.date, amountCents: netCents, memo: input.memo ?? null, ...target },
              trx
            )
          : await this.linkable(household, account, input.transferId!, netCents, trx)

        const payslip = await Payslip.create(
          {
            householdId: household.id,
            accountId: account.id,
            userId,
            date: input.date,
            grossCents: input.grossCents,
            netCents,
            transferId: transfer.id,
            memo: input.memo ?? null,
            clientId: input.clientId ?? null,
            createdByUserId: actor.id,
          },
          { client: trx }
        )

        const line = {
          householdId: household.id,
          accountId: account.id,
          date: input.date,
          currencyCode: account.currencyCode,
          paidByUserId: userId,
          payslipId: payslip.id,
          status: 'cleared' as const,
          source: 'manual' as const,
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
        }
        await Transaction.createMany(
          [
            {
              ...line,
              kind: 'income' as const,
              amountCents: input.grossCents,
              categoryId: grossCategoryId,
              description: input.memo ?? null,
            },
            ...input.deductions.map((deduction) => ({
              ...line,
              kind: 'expense' as const,
              amountCents: -deduction.amountCents,
              categoryId: deduction.categoryId,
              description: deduction.memo ?? null,
            })),
          ],
          { client: trx }
        )
        return payslip.id
      })
      return { payslip: await this.find(household, payslipId), created: true }
    } catch (error) {
      if (input.clientId && isUniqueViolationOn(error, CLIENT_ID_CONSTRAINT)) {
        const existing = await this.findByClientId(household, input.clientId)
        if (existing) return { payslip: existing, created: false }
      }
      // Two payslips raced for the same transfer: the index kept one.
      if (isUniqueViolationOn(error, TRANSFER_CONSTRAINT)) {
        throw new FieldError('transferId', 'linked')
      }
      throw error
    }
  }

  /**
   * Deletes the payslip and its rows; the transfer stays (unlinked). A row
   * the partner made private cannot be deleted by anyone else (403), the
   * same as through `/transactions`.
   */
  async destroy(household: HouseholdRef, actor: User, payslipId: number) {
    const viewer = await privacyViewer(household, actor)
    await db.transaction(async (trx) => {
      const payslip = await Payslip.query({ client: trx })
        .where('household_id', householdIdOf(household))
        .where('id', payslipId)
        .forUpdate()
        .firstOrFail()
      const lines = await Transaction.query({ client: trx })
        .where('payslip_id', payslip.id)
        .forUpdate()
      if (lines.some((line) => isHiddenFrom(line, viewer))) throw new PrivateTransaction()
      await Transaction.query({ client: trx }).where('payslip_id', payslip.id).delete()
      await payslip.delete()
    })
  }

  protected async findByClientId(household: HouseholdRef, clientId: string) {
    const existing = await Payslip.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('client_id', clientId)
      .first()
    return existing ? this.find(household, existing.id) : null
  }

  /** Every deduction goes to an expense category (422 on `deductions.<n>.categoryId`). */
  protected async assertExpenseCategories(household: HouseholdRef, input: CreatePayslipInput) {
    const ids = [...new Set(input.deductions.map((line) => line.categoryId))]
    if (ids.length === 0) return
    const expense = await Category.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .whereIn('id', ids)
      .whereHas('group', (group) => group.where('kind', 'expense'))
      .select('id')
    const allowed = new Set(expense.map((category) => category.id))
    const index = input.deductions.findIndex((line) => !allowed.has(line.categoryId))
    if (index >= 0) throw new FieldError(`deductions.${index}.categoryId`, 'expenseCategory')
  }

  /**
   * The transfer to link, locked for the rest of `trx`: of the household
   * (422 `database.exists`), leaving the payslip's account, not explained
   * by another payslip yet, and for exactly the net.
   */
  protected async linkable(
    household: Household,
    account: Account,
    transferId: number,
    netCents: number,
    trx: TransactionClientContract
  ) {
    const transfer = await Transfer.query({ client: trx })
      .where('household_id', household.id)
      .where('id', transferId)
      .forUpdate()
      .first()
    if (!transfer) throw new FieldError('transferId', 'database.exists')
    if (transfer.fromAccountId !== account.id) throw new FieldError('transferId', 'wrongAccount')

    const linked = await Payslip.query({ client: trx }).where('transfer_id', transfer.id).first()
    if (linked) throw new FieldError('transferId', 'linked')

    if (transfer.amountCents !== netCents) {
      throw new FieldError('deductions', 'netMismatch', {
        netCents,
        transferCents: transfer.amountCents,
        differenceCents: netCents - transfer.amountCents,
      })
    }
    return transfer
  }

  protected async grossCategoryId(household: HouseholdRef) {
    const category = await Category.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('slug', GROSS_CATEGORY_SLUG)
      .first()
    return category?.id ?? null
  }
}
