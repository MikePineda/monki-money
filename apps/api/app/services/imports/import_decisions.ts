import { DateTime } from 'luxon'
import type User from '#models/user'
import { inject } from '@adonisjs/core'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import type Household from '#models/household'
import Transaction from '#models/transaction'
import db from '@adonisjs/lucid/services/db'
import { FieldError } from '#exceptions/field_error'
import { validateSplits } from '#domain/ledger/splits'
import { signedLines } from '#domain/ledger/amounts'
import { findInHousehold } from '#repositories/scoped'
import { ImportBatchClosed } from '#exceptions/errors'
import type { DecideInput, RowChange } from '#services/imports/dto'
import { effectiveRow } from '#services/imports/effective_row'
import type { ImportRowDecision } from '@monkimoney/shared'
import LedgerReferences from '#services/ledger/ledger_references'
import ImportBookkeeping from '#services/imports/import_bookkeeping'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

const DECISION_KEYS = [
  'categoryId',
  'transferAccountId',
  'matchTransactionId',
  'paidByUserId',
  'payee',
  'splits',
  'learnRule',
] as const satisfies ReadonlyArray<keyof ImportRowDecision>

/**
 * What a person decides for a staged row (`PATCH /imports/:id/rows/:rowId`,
 * several at once with `PATCH /imports/:id/rows`, or inline with confirm):
 * the resolution plus any of category, split lines, transfer account,
 * matching transaction, payer and payee. Ids are checked against the
 * household (422) and the row's own account; nothing reaches the ledger
 * until confirm, which checks them again. Duplicate rows take no decision.
 */
@inject()
export default class ImportDecisions {
  constructor(
    protected references: LedgerReferences,
    protected bookkeeping: ImportBookkeeping
  ) {}

  async decide(
    household: Household,
    actor: User,
    batchId: number,
    rowId: number,
    input: DecideInput
  ): Promise<ImportRow> {
    await findInHousehold(ImportBatch, household, batchId)
    return db.transaction(async (trx) => {
      // Same lock as confirm: a decision never lands on a batch being confirmed.
      const batch = await ImportBatch.query({ client: trx })
        .where('household_id', household.id)
        .where('id', batchId)
        .forUpdate()
        .firstOrFail()
      if (!batch.isStaged) throw new ImportBatchClosed()
      const row = await this.rowOf(batch, rowId, trx)
      const decided = await this.apply(household, actor, batch, row, input, trx)
      await this.bookkeeping.refreshCounts(batch, trx)
      return decided
    })
  }

  /**
   * Several rows' changes in ONE transaction with the batch locked: any
   * refusal (422 `changes.<index>.<field>`, 404 for a row outside the
   * batch, 409 once closed) leaves every row as it was. Answers the
   * changed rows in file order, ready for the transformer.
   */
  async decideMany(
    household: Household,
    actor: User,
    batchId: number,
    changes: RowChange[]
  ): Promise<ImportRow[]> {
    await findInHousehold(ImportBatch, household, batchId)
    const rowIds = await db.transaction(async (trx) => {
      const batch = await ImportBatch.query({ client: trx })
        .where('household_id', household.id)
        .where('id', batchId)
        .forUpdate()
        .firstOrFail()
      if (!batch.isStaged) throw new ImportBatchClosed()
      for (const [index, change] of changes.entries()) {
        const row = await this.rowOf(batch, change.rowId, trx)
        try {
          await this.apply(household, actor, batch, row, change, trx)
        } catch (error) {
          throw error instanceof FieldError ? error.within(`changes.${index}`) : error
        }
      }
      await this.bookkeeping.refreshCounts(batch, trx)
      return [...new Set(changes.map((change) => change.rowId))]
    })
    return ImportRow.query()
      .where('household_id', household.id)
      .where('import_batch_id', batchId)
      .whereIn('id', rowIds)
      .preload('matchTransaction')
      .preload('transaction')
      .orderBy('row_index')
  }

  /** The row of the batch, locked (404 otherwise, a row of another batch included). */
  async rowOf(batch: ImportBatch, rowId: number, trx: TransactionClientContract) {
    return ImportRow.query({ client: trx })
      .where('household_id', batch.householdId)
      .where('import_batch_id', batch.id)
      .where('id', rowId)
      .forUpdate()
      .firstOrFail()
  }

  /**
   * Stores the decision on the row (inside the caller's transaction). With
   * `reset` the person's earlier decision goes first: the row is back to
   * the importer's proposal (`proposed_resolution`), undecided unless the
   * change sets something else.
   */
  async apply(
    household: Household,
    actor: User,
    batch: ImportBatch,
    row: ImportRow,
    input: DecideInput & Pick<RowChange, 'reset'>,
    trx: TransactionClientContract
  ): Promise<ImportRow> {
    if (!batch.isStaged) throw new ImportBatchClosed()
    // Already in the ledger: listed for the record, never decided.
    if (row.resolution === 'duplicate') throw new FieldError('resolution', 'duplicate')
    if (!row.isOpen) throw new ImportBatchClosed()

    row.useTransaction(trx)
    if (input.reset) {
      row.merge({
        resolution: row.proposedResolution ?? row.resolution,
        decision: null,
        decidedAt: null,
        decidedByUserId: null,
      })
    }
    const keys = DECISION_KEYS.filter((key) => input[key] !== undefined)
    if (input.reset && input.resolution === undefined && keys.length === 0) {
      // Undecided again: confirm checks the proposal like any untouched row.
      await row.save()
      return row
    }

    const decision: ImportRowDecision = { ...(row.decision ?? {}) }
    for (const key of keys) Object.assign(decision, { [key]: input[key] })
    row.merge({
      resolution: input.resolution ?? row.resolution,
      decision,
      decidedAt: DateTime.now(),
      decidedByUserId: actor.id,
    })
    await this.validate(household, row, trx)

    await row.save()
    return row
  }

  /**
   * The row's effective decision still points at things of the household
   * (422 per field). Confirm calls it again: a category or account deleted
   * since the decision fails the whole confirm. A movement of 0.00 can only
   * be ignored.
   */
  async validate(household: Household, row: ImportRow, trx: TransactionClientContract) {
    const effective = effectiveRow(row)
    const decision = row.decision ?? {}

    if (row.amountCents === 0 && row.resolution !== 'ignored') {
      throw new FieldError('resolution', 'zeroAmount')
    }

    if (effective.splits.length > 0 && typeof decision.categoryId === 'number') {
      throw new FieldError('categoryId', 'split')
    }
    if (typeof decision.categoryId === 'number') {
      await this.references.categories(household, [decision.categoryId], 'categoryId')
    }
    if (effective.splits.length > 0) {
      await this.references.categories(
        household,
        effective.splits.map((line) => line.categoryId),
        'splits'
      )
      this.splitLines(row.amountCents, effective)
    }
    if (typeof decision.paidByUserId === 'number') {
      await this.references.payer(household, decision.paidByUserId)
    }

    const transferTarget =
      row.resolution === 'transfer_leg' || Object.hasOwn(decision, 'transferAccountId')
    if (typeof effective.transferAccountId === 'number' && transferTarget) {
      await this.transferAccount(household, row, effective.transferAccountId)
    }
    if (row.resolution === 'transfer_leg' && effective.transferAccountId === null) {
      throw new FieldError('transferAccountId', 'required')
    }

    if (typeof decision.matchTransactionId === 'number') {
      await this.assertMatchable(household, row, decision.matchTransactionId, trx)
    }
    if (row.resolution === 'auto_matched' && effective.matchTransactionId === null) {
      throw new FieldError('matchTransactionId', 'required')
    }
    if (row.resolution === 'auto_matched' && effective.matchTransactionId !== null) {
      await this.assertUnclaimedInBatch(row, effective.matchTransactionId, trx)
    }
  }

  /**
   * A transaction a person picks as the bank copy: of the household (422
   * `database.exists`), of the row's account, with the same amount, and not
   * already the copy of a posted bank row (a pending one is fine: this row
   * upgrades it).
   */
  protected async assertMatchable(
    household: Household,
    row: ImportRow,
    transactionId: number,
    trx: TransactionClientContract
  ) {
    const target = await Transaction.query({ client: trx })
      .where('household_id', household.id)
      .where('id', transactionId)
      .first()
    if (!target) throw new FieldError('matchTransactionId', 'database.exists')
    if (target.accountId !== row.accountId) {
      throw new FieldError('matchTransactionId', 'sameAccount')
    }
    if (target.amountCents !== row.amountCents) {
      throw new FieldError('matchTransactionId', 'amountMismatch')
    }
    const posted = await ImportRow.query({ client: trx })
      .where('transaction_id', target.id)
      .where('account_id', row.accountId)
      .whereNot('id', row.id)
      .whereNot('resolution', 'superseded')
      .where('is_pending', false)
      .first()
    if (posted) throw new FieldError('matchTransactionId', 'claimed')
  }

  /** One bank row per transaction: no other open row of the batch matches it. */
  protected async assertUnclaimedInBatch(
    row: ImportRow,
    transactionId: number,
    trx: TransactionClientContract
  ) {
    const others = await ImportRow.query({ client: trx })
      .where('import_batch_id', row.importBatchId)
      .whereNot('id', row.id)
      .whereNull('confirmed_at')
      .where('resolution', 'auto_matched')
    if (others.some((other) => effectiveRow(other).matchTransactionId === transactionId)) {
      throw new FieldError('matchTransactionId', 'claimed')
    }
  }

  /** Split lines signed like the row and checked against its amount (422 `splits`). */
  splitLines(amountCents: number, effective: ReturnType<typeof effectiveRow>) {
    if (effective.splits.length === 0) return []
    const direction = amountCents < 0 ? 'expense' : 'income'
    const amounts = signedLines(
      direction,
      effective.splits.map((line) => line.amountCents)
    )
    const lines = effective.splits.map((line, index) => ({ ...line, amountCents: amounts[index] }))
    const validation = validateSplits(amountCents, lines)
    if (!validation.valid) {
      throw new FieldError('splits', validation.problem, {
        differenceCents: Math.abs(validation.differenceCents),
      })
    }
    return lines
  }

  /** The other account of a transfer row (422 when gone or the same account). */
  async transferAccount(household: Household, row: ImportRow, accountId: number) {
    if (accountId === row.accountId) throw new FieldError('transferAccountId', 'sameAccount')
    return this.references.account(household, accountId, 'transferAccountId')
  }

  /** The ledger row a match points at, in the row's account (422 when gone). */
  async matchTarget(row: ImportRow, transactionId: number, trx: TransactionClientContract) {
    const target = await Transaction.query({ client: trx })
      .where('household_id', row.householdId)
      .where('account_id', row.accountId)
      .where('id', transactionId)
      .forUpdate()
      .first()
    if (!target) throw new FieldError('matchTransactionId', 'database.exists')
    return target
  }
}
