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
import type { DecideInput } from '#services/imports/dto'
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
 * or inline with confirm): the resolution plus any of category, split
 * lines, transfer account, matching transaction, payer and payee. Ids are
 * checked against the household (422) and the row's own account; nothing
 * reaches the ledger until confirm, which checks them again.
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
    const batch = await findInHousehold(ImportBatch, household, batchId)
    const row = await this.rowOf(batch, rowId)
    return db.transaction(async (trx) => {
      const decided = await this.apply(household, actor, batch, row, input, trx)
      await this.bookkeeping.refreshCounts(batch, trx)
      return decided
    })
  }

  /** The row of the batch (404 otherwise, a row of another batch included). */
  async rowOf(batch: ImportBatch, rowId: number, trx?: TransactionClientContract) {
    return ImportRow.query({ client: trx })
      .where('household_id', batch.householdId)
      .where('import_batch_id', batch.id)
      .where('id', rowId)
      .firstOrFail()
  }

  /** Stores the decision on the row (inside the caller's transaction). */
  async apply(
    household: Household,
    actor: User,
    batch: ImportBatch,
    row: ImportRow,
    input: DecideInput,
    trx: TransactionClientContract
  ): Promise<ImportRow> {
    if (!batch.isStaged || !row.isOpen) throw new ImportBatchClosed()

    const decision: ImportRowDecision = { ...(row.decision ?? {}) }
    for (const key of DECISION_KEYS) {
      if (input[key] !== undefined) Object.assign(decision, { [key]: input[key] })
    }
    row.merge({
      resolution: input.resolution ?? row.resolution,
      decision,
      decidedAt: DateTime.now(),
      decidedByUserId: actor.id,
    })
    await this.validate(household, row)

    row.useTransaction(trx)
    await row.save()
    return row
  }

  /**
   * The row's effective decision still points at things of the household
   * (422 per field). Confirm calls it again: a category or account deleted
   * since the decision fails the whole confirm.
   */
  async validate(household: Household, row: ImportRow) {
    const effective = effectiveRow(row)
    const decision = row.decision ?? {}

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
      const target = await Transaction.query()
        .where('household_id', household.id)
        .where('id', decision.matchTransactionId)
        .first()
      if (!target) throw new FieldError('matchTransactionId', 'database.exists')
      if (target.accountId !== row.accountId) {
        throw new FieldError('matchTransactionId', 'sameAccount')
      }
    }
    if (row.resolution === 'auto_matched' && effective.matchTransactionId === null) {
      throw new FieldError('matchTransactionId', 'required')
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
