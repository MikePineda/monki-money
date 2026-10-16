import type User from '#models/user'
import Clock from '#services/clock'
import { firstActiveAccount, lastAccountUsed } from '#services/ledger/last_account'
import { inject } from '@adonisjs/core'
import type Household from '#models/household'
import Transaction from '#models/transaction'
import db from '@adonisjs/lucid/services/db'
import type { EntryKind } from '@monkimoney/shared'
import { todayIn } from '#domain/calendar/month'
import { defaultPayer } from '#domain/ledger/payer'
import { FieldError } from '#exceptions/field_error'
import { isHiddenFrom, type PrivacyViewer } from '#domain/ledger/privacy'
import { validateSplits } from '#domain/ledger/splits'
import TransactionSplit from '#models/transaction_split'
import { findInHousehold, idsInHousehold } from '#repositories/scoped'
import { signedAmount, signedLines } from '#domain/ledger/amounts'
import { isUniqueViolationOn } from '#services/ledger/unique_violation'
import RuleLearner from '#services/rules/rule_learner'
import LedgerReferences from '#services/ledger/ledger_references'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import TransactionListing from '#services/ledger/transaction_listing'
import { touchesPayslipTotals } from '#domain/payslips/line_edits'
import { PayslipLineReadOnly, PrivateTransaction, TransferLegReadOnly } from '#exceptions/errors'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { householdIdOf, type HouseholdRef } from '#models/mixins/household_scoped'
import type {
  BulkCategorizeInput,
  CreateTransactionInput,
  QuickTransactionInput,
  SplitLineInput,
  TransactionFilters,
  UpdateSplitsInput,
  UpdateTransactionInput,
} from '#services/ledger/dto'

/** Partial unique index of migration 11: one row per (household, client_id). */
const CLIENT_ID_CONSTRAINT = 'transactions_household_client_id_unique'

function definedOnly<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>
}

/**
 * Expenses and income of the household (transfers have TransferService).
 * Every write runs in one DB transaction; ids in the path are
 * household-scoped (404), ids in the body are checked (422). Transfer legs
 * are read-only here (409), a payslip's rows keep their amount, kind,
 * account, date and existence (409: the payslip owns them) and a partner's
 * private transaction can only be read, masked (403 on writes).
 */
@inject()
export default class TransactionService {
  constructor(
    protected references: LedgerReferences,
    protected listing: TransactionListing,
    protected clock: Clock,
    protected learner: RuleLearner = new RuleLearner()
  ) {}

  /** `paidBy=joint` (no payer) and a `paidByUserId` exclude each other (422). */
  list(household: Household, viewer: PrivacyViewer, filters: TransactionFilters) {
    if (filters.paidBy === 'joint' && filters.paidByUserId !== undefined) {
      throw new FieldError('paidBy', 'exclusive')
    }
    return this.listing.paginate(household, viewer, filters)
  }

  async find(household: HouseholdRef, transactionId: number) {
    const transaction = await findInHousehold(Transaction, household, transactionId)
    await transaction.load('splits', (splits) => splits.orderBy('sort_order').orderBy('id'))
    return transaction
  }

  /**
   * Creates an expense or income. With a `clientId` already used in the
   * household, returns that row instead (`created: false`), even when the
   * retry races the first request.
   */
  async create(
    household: Household,
    actor: User,
    input: CreateTransactionInput
  ): Promise<{ transaction: Transaction; created: boolean }> {
    if (input.clientId) {
      const existing = await this.findByClientId(household, input.clientId)
      if (existing) return { transaction: existing, created: false }
    }

    const account = await this.references.account(household, input.accountId)
    const splits = input.splits ?? []
    if (splits.length > 0 && input.categoryId !== undefined && input.categoryId !== null) {
      throw new FieldError('categoryId', 'split')
    }
    await this.references.categories(household, [input.categoryId], 'categoryId')
    await this.references.categories(
      household,
      splits.map((line) => line.categoryId),
      'splits'
    )
    await this.references.payer(household, input.paidByUserId)

    const amountCents = signedAmount(input.kind, input.amountCents)
    const lines = this.splitLines(amountCents, splits)
    const paidByUserId =
      input.paidByUserId !== undefined
        ? input.paidByUserId
        : defaultPayer({
            accountOwnerUserId: account.ownerUserId,
            cards: account.cards,
            cardSuffix: input.cardSuffix,
            creatorUserId: actor.id,
          })

    try {
      const transactionId = await db.transaction(async (trx) => {
        const transaction = await Transaction.create(
          {
            householdId: household.id,
            accountId: account.id,
            kind: input.kind,
            date: input.date,
            bankDate: input.bankDate ?? null,
            amountCents,
            currencyCode: account.currencyCode,
            payee: input.payee ?? null,
            description: input.description ?? null,
            rawDescription: input.rawDescription ?? null,
            categoryId: lines.length > 0 ? null : (input.categoryId ?? null),
            isSplit: lines.length > 0,
            paidByUserId,
            status: input.status ?? 'cleared',
            source: input.source ?? 'manual',
            needsReview: input.needsReview ?? false,
            cardSuffix: input.cardSuffix ?? null,
            clientId: input.clientId ?? null,
            isPrivate: input.isPrivate ?? false,
            tags: input.tags ?? [],
            createdByUserId: actor.id,
            updatedByUserId: actor.id,
          },
          { client: trx }
        )
        await this.insertLines(household, transaction.id, lines, trx)
        return transaction.id
      })
      return { transaction: await this.find(household, transactionId), created: true }
    } catch (error) {
      if (input.clientId && isUniqueViolationOn(error, CLIENT_ID_CONSTRAINT)) {
        const existing = await this.findByClientId(household, input.clientId)
        if (existing) return { transaction: existing, created: false }
      }
      throw error
    }
  }

  /**
   * Quick add: the account defaults to the one this person used last (else
   * the first active account), the date to today in the household's time
   * zone, the kind to expense. The category stays optional.
   */
  async quick(household: Household, actor: User, input: QuickTransactionInput) {
    const accountId = input.accountId ?? (await this.defaultAccountId(household, actor))
    if (!accountId) throw new FieldError('accountId', 'required')

    return this.create(household, actor, {
      ...input,
      accountId,
      kind: input.kind ?? 'expense',
      date: input.date ?? todayIn(this.clock.now(), household.timezone),
    })
  }

  /**
   * Edits an expense or income. Everything is decided on the row locked
   * inside the DB transaction, so two overlapping edits never work from a
   * stale copy (e.g. flipping the split lines twice).
   */
  async update(
    household: Household,
    actor: User,
    transactionId: number,
    input: UpdateTransactionInput
  ) {
    await db.transaction(async (trx) => {
      const transaction = await this.lockForWrite(household, actor, transactionId, trx)
      if (transaction.payslipId !== null && touchesPayslipTotals(transaction, input)) {
        throw new PayslipLineReadOnly()
      }

      const account =
        input.accountId !== undefined && input.accountId !== transaction.accountId
          ? await this.references.account(household, input.accountId)
          : null
      if (input.categoryId !== undefined && input.categoryId !== null) {
        if (transaction.isSplit) throw new FieldError('categoryId', 'split')
        await this.references.categories(household, [input.categoryId], 'categoryId')
      }
      await this.references.payer(household, input.paidByUserId)

      const previousAmountCents = transaction.amountCents
      const kind: EntryKind = input.kind ?? (transaction.kind === 'income' ? 'income' : 'expense')
      const amountCents = signedAmount(kind, input.amountCents ?? previousAmountCents)
      if (transaction.isSplit && Math.abs(amountCents) !== Math.abs(previousAmountCents)) {
        throw new FieldError('amountCents', 'splitSum')
      }

      transaction.merge({
        ...definedOnly({
          accountId: input.accountId,
          date: input.date,
          categoryId: input.categoryId,
          payee: input.payee,
          description: input.description,
          paidByUserId: input.paidByUserId,
          status: input.status,
          isPrivate: input.isPrivate,
          tags: input.tags,
          needsReview: input.needsReview,
        }),
        ...(account ? { currencyCode: account.currencyCode } : {}),
        kind,
        amountCents,
        updatedByUserId: actor.id,
      })
      // Categorizing is reviewing, unless the request says otherwise.
      if (input.categoryId && input.needsReview === undefined) transaction.needsReview = false
      await transaction.save()

      if (transaction.isSplit) {
        await this.syncLines(
          transaction,
          Math.sign(amountCents) !== Math.sign(previousAmountCents),
          trx
        )
      }
      if (input.applyToFuture && input.categoryId) {
        await this.learner.learnFromEdit(household, actor, transaction, trx)
      }
    })

    return this.find(household, transactionId)
  }

  /**
   * Hard delete. The bank row it came from stays, marked `ignored`, so
   * re-importing the export never brings it back.
   */
  async destroy(household: Household, actor: User, transactionId: number) {
    await db.transaction(async (trx) => {
      const transaction = await this.lockForWrite(household, actor, transactionId, trx)
      if (transaction.payslipId !== null) throw new PayslipLineReadOnly()
      await trx
        .from('import_rows')
        .where('household_id', transaction.householdId)
        .where('transaction_id', transaction.id)
        .whereNot('resolution', 'superseded')
        .update({ resolution: 'ignored', updated_at: new Date() })
      await transaction.delete()
    })
  }

  /**
   * Replaces the split lines (they must add up to the amount), or with no
   * lines turns the transaction back into a single one, optionally with a
   * category. Works on the locked row.
   */
  async updateSplits(
    household: Household,
    actor: User,
    transactionId: number,
    input: UpdateSplitsInput
  ) {
    if (input.splits.length > 0 && input.categoryId !== undefined && input.categoryId !== null) {
      throw new FieldError('categoryId', 'split')
    }

    await db.transaction(async (trx) => {
      const transaction = await this.lockForWrite(household, actor, transactionId, trx)
      await this.references.categories(household, [input.categoryId], 'categoryId')
      await this.references.categories(
        household,
        input.splits.map((line) => line.categoryId),
        'splits'
      )
      const lines = this.splitLines(transaction.amountCents, input.splits)

      await TransactionSplit.query({ client: trx }).where('transaction_id', transaction.id).delete()
      transaction.merge(
        lines.length > 0
          ? { isSplit: true, categoryId: null, needsReview: false, updatedByUserId: actor.id }
          : { isSplit: false, categoryId: input.categoryId ?? null, updatedByUserId: actor.id }
      )
      await transaction.save()
      await this.insertLines(household, transaction.id, lines, trx)
      if (lines.length > 0) await this.syncLines(transaction, false, trx)
    })

    return this.find(household, transactionId)
  }

  /**
   * Sets one category on many transactions (triage). Transfer legs, split
   * transactions (no category of their own) and the partner's private rows
   * are skipped, never touched.
   */
  async bulkCategorize(household: Household, actor: User, input: BulkCategorizeInput) {
    const ids = [...new Set(input.ids)]
    const owned = await idsInHousehold(Transaction, household, ids)
    if (ids.some((id) => !owned.has(id))) throw new FieldError('ids', 'database.exists')
    await this.references.categories(household, [input.categoryId], 'categoryId')

    const viewer = await privacyViewer(household, actor)
    const rows = await Transaction.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .whereIn('id', ids)
    const eligible = rows
      .filter((row) => !row.isTransferLeg && !row.isSplit && !isHiddenFrom(row, viewer))
      .map((row) => row.id)

    let updated = 0
    if (eligible.length > 0) {
      // The conditions are repeated in the UPDATE: a row split or turned
      // into a transfer meanwhile is skipped instead of breaking a CHECK.
      const affected = await Transaction.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .whereIn('id', eligible)
        .where('is_split', false)
        .whereNot('kind', 'transfer')
        .update({
          category_id: input.categoryId,
          ...(input.categoryId === null ? {} : { needs_review: false }),
          updated_by_user_id: actor.id,
          updated_at: new Date(),
        })
      updated = Number(Array.isArray(affected) ? affected[0] : affected)
    }

    return { updated, skipped: ids.length - updated }
  }

  protected async findByClientId(household: HouseholdRef, clientId: string) {
    const existing = await Transaction.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('client_id', clientId)
      .first()
    return existing ? this.find(household, existing.id) : null
  }

  /**
   * The row locked for the rest of `trx`, if this person may change it:
   * 404 for another household, 409 for a transfer leg, 403 for the
   * partner's private row.
   */
  protected async lockForWrite(
    household: HouseholdRef,
    actor: User,
    transactionId: number,
    trx: TransactionClientContract
  ) {
    const transaction = await Transaction.query({ client: trx })
      .where('household_id', householdIdOf(household))
      .where('id', transactionId)
      .forUpdate()
      .firstOrFail()
    if (transaction.isTransferLeg) throw new TransferLegReadOnly()
    if (isHiddenFrom(transaction, await privacyViewer(household, actor))) {
      throw new PrivateTransaction()
    }
    return transaction
  }

  /**
   * Re-reads the split lines inside `trx`, flips them (absolute values,
   * computed from the locked rows) when the parent changed direction, and
   * checks they still add up to the parent before anything commits.
   */
  protected async syncLines(
    transaction: Transaction,
    flip: boolean,
    trx: TransactionClientContract
  ) {
    const lines = await TransactionSplit.query({ client: trx })
      .where('transaction_id', transaction.id)
      .orderBy('sort_order')
      .orderBy('id')
    if (flip) {
      for (const line of lines) {
        line.amountCents = -line.amountCents
        await line.save()
      }
    }

    const validation = validateSplits(transaction.amountCents, lines)
    if (!validation.valid) {
      throw new FieldError('splits', validation.problem, {
        differenceCents: Math.abs(validation.differenceCents),
      })
    }
  }

  /** The account this person used last, else the first active one. */
  protected async defaultAccountId(household: Household, actor: User) {
    return (await lastAccountUsed(household, actor)) ?? firstActiveAccount(household)
  }

  /** Signed split lines checked against the parent amount (422 on `splits`). */
  protected splitLines(parentAmountCents: number, splits: SplitLineInput[]) {
    if (splits.length === 0) return []

    const direction: EntryKind = parentAmountCents < 0 ? 'expense' : 'income'
    const amounts = signedLines(
      direction,
      splits.map((line) => line.amountCents)
    )
    const lines = splits.map((line, index) => ({ ...line, amountCents: amounts[index] }))

    const validation = validateSplits(parentAmountCents, lines)
    if (!validation.valid) {
      throw new FieldError('splits', validation.problem, {
        differenceCents: Math.abs(validation.differenceCents),
      })
    }
    return lines
  }

  protected async insertLines(
    household: HouseholdRef,
    transactionId: number,
    lines: SplitLineInput[],
    trx: TransactionClientContract
  ) {
    if (lines.length === 0) return
    await TransactionSplit.createMany(
      lines.map((line, index) => ({
        householdId: householdIdOf(household),
        transactionId,
        categoryId: line.categoryId,
        amountCents: line.amountCents,
        memo: line.memo ?? null,
        sortOrder: index,
      })),
      { client: trx }
    )
  }
}
