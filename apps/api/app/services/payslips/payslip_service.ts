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
 * always holds (422 otherwise). There is no update: a payslip is deleted
 * (its rows go, the transfer stays and becomes a candidate again) and
 * recorded again.
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

  async create(household: Household, actor: User, input: CreatePayslipInput) {
    const account = await this.references.account(household, input.accountId)
    await this.references.categories(
      household,
      input.deductions.map((line) => line.categoryId),
      'deductions'
    )
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
      return this.find(household, payslipId)
    } catch (error) {
      // Two payslips raced for the same transfer: the index kept one.
      if (isUniqueViolationOn(error, TRANSFER_CONSTRAINT)) {
        throw new FieldError('transferId', 'linked')
      }
      throw error
    }
  }

  /** Deletes the payslip and its rows; the transfer stays (unlinked). */
  async destroy(household: HouseholdRef, payslipId: number) {
    await db.transaction(async (trx) => {
      const payslip = await Payslip.query({ client: trx })
        .where('household_id', householdIdOf(household))
        .where('id', payslipId)
        .forUpdate()
        .firstOrFail()
      await Transaction.query({ client: trx }).where('payslip_id', payslip.id).delete()
      await payslip.delete()
    })
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
