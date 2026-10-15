import { DateTime } from 'luxon'
import type User from '#models/user'
import Account from '#models/account'
import Transfer from '#models/transfer'
import { inject } from '@adonisjs/core'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import type Household from '#models/household'
import Transaction from '#models/transaction'
import db from '@adonisjs/lucid/services/db'
import TransactionSplit from '#models/transaction_split'
import { findInHousehold } from '#repositories/scoped'
import RuleLearner from '#services/rules/rule_learner'
import { decodeHtmlEntities } from '#importers/html_entities'
import type { LearningDecision } from '#domain/importing/learning'
import ImportDecisions from '#services/imports/import_decisions'
import ImportBookkeeping from '#services/imports/import_bookkeeping'
import { ImportBatchClosed, ImportRowsUndecided } from '#exceptions/errors'
import { type EffectiveRow, effectiveRow, reviewRowOf } from '#services/imports/effective_row'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { ConfirmInput, ConfirmMode, ConfirmResult } from '#services/imports/dto'
import {
  type ConfirmAction,
  confirmActionFor,
  isAutoConfirmable,
  reconcile,
} from '#domain/importing/review'

interface Applied {
  row: ImportRow
  effective: EffectiveRow
  action: ConfirmAction
}

interface Tally {
  created: number
  matched: number
  ignored: number
  transfers: number
}

/**
 * `POST /imports/:id/confirm`: turns the reviewed rows of a staged batch
 * into ledger rows in ONE database transaction, with the batch locked
 * (`FOR UPDATE`) so two confirms never race:
 *
 * - create: a new expense/income (`source = import`, pending or cleared,
 *   bank date, raw bank text, card, payer, category or split lines);
 * - match: links the bank row to the existing transaction and stamps the
 *   bank's data on it; a pending import is upgraded and its old row
 *   `superseded`;
 * - transfer: a `transfers` row with this account's leg plus the other
 *   leg: the existing movement in the other account (turned into a leg),
 *   the other account's row of the same upload, or a new one;
 * - ignore: the row stays, so its hash never comes back.
 *
 * Then rules are learned, the opening balance is derived on the account's
 * first import, the batch closes and the ledger is reconciled with the
 * bank's balance. Any failure rolls everything back.
 */
@inject()
export default class ImportConfirmer {
  constructor(
    protected decisions: ImportDecisions,
    protected learner: RuleLearner,
    protected bookkeeping: ImportBookkeeping
  ) {}

  async confirm(
    household: Household,
    actor: User,
    batchId: number,
    input: ConfirmInput,
    mode: ConfirmMode
  ): Promise<ConfirmResult> {
    await findInHousehold(ImportBatch, household, batchId)

    return db.transaction(async (trx) => {
      const batch = await ImportBatch.query({ client: trx })
        .where('household_id', household.id)
        .where('id', batchId)
        .forUpdate()
        .firstOrFail()
      if (!batch.isStaged) throw new ImportBatchClosed()

      for (const decision of input.decisions ?? []) {
        const row = await this.decisions.rowOf(batch, decision.rowId, trx)
        await this.decisions.apply(household, actor, batch, row, decision, trx)
      }

      const account = await Account.query({ client: trx })
        .where('id', batch.accountId)
        .preload('cards')
        .firstOrFail()
      const open = await ImportRow.query({ client: trx })
        .where('import_batch_id', batch.id)
        .whereNull('confirmed_at')
        .whereNot('resolution', 'superseded')
        .orderBy('row_index')
        .forUpdate()

      const reviewed = open.map((row) => {
        const effective = effectiveRow(row)
        const review = reviewRowOf(row, effective)
        return { row, effective, review, action: confirmActionFor(review) }
      })
      const undecided = reviewed.filter((entry) => entry.action === null)
      if (mode === 'all' && undecided.length > 0) {
        throw new ImportRowsUndecided({ rowIds: undecided.map((entry) => entry.row.id) })
      }
      const selected = reviewed.filter((entry) =>
        mode === 'all' ? entry.action !== null : isAutoConfirmable(entry.review)
      ) as Applied[]

      const tally: Tally = { created: 0, matched: 0, ignored: 0, transfers: 0 }
      for (const entry of selected) {
        if (entry.row.decidedAt !== null) await this.decisions.validate(household, entry.row)
        await this.apply(household, actor, account, entry, tally, trx)
      }

      await this.learn(household, actor, selected, trx)

      if (batch.openingBalanceCents !== null && account.openingBalanceDate === null) {
        account.useTransaction(trx)
        account.merge({
          openingBalanceCents: batch.openingBalanceCents,
          openingBalanceDate: batch.dateFrom,
        })
        await account.save()
      }

      const remaining = reviewed.length - selected.length
      batch.useTransaction(trx)
      batch.computedBalanceCents = await this.bookkeeping.ledgerBalance(account, batch.dateTo!, {
        client: trx,
      })
      if (remaining === 0) batch.merge({ status: 'completed', completedAt: DateTime.now() })
      await this.bookkeeping.refreshCounts(batch, trx)

      return {
        batchId: batch.id,
        status: batch.status,
        ...tally,
        remaining,
        reconciliation: reconcile({
          asOf: batch.dateTo,
          dateFrom: batch.dateFrom,
          expectedBalanceCents: batch.expectedBalanceCents,
          computedBalanceCents: batch.computedBalanceCents,
          openingBalanceCents: batch.openingBalanceCents,
        }),
      }
    })
  }

  protected async apply(
    household: Household,
    actor: User,
    account: Account,
    entry: Applied,
    tally: Tally,
    trx: TransactionClientContract
  ) {
    switch (entry.action) {
      case 'create':
        await this.link(entry.row, (await this.create(household, actor, account, entry, trx)).id)
        tally.created++
        return
      case 'match':
        await this.link(entry.row, (await this.match(entry, trx)).id)
        tally.matched++
        return
      case 'transfer':
        await this.link(entry.row, (await this.transfer(household, actor, account, entry, trx)).id)
        tally.transfers++
        return
      case 'ignore':
        entry.row.merge({ resolution: 'ignored', confirmedAt: DateTime.now() })
        await entry.row.save()
        tally.ignored++
    }
  }

  protected async create(
    household: Household,
    actor: User,
    account: Account,
    { row, effective }: Applied,
    trx: TransactionClientContract
  ) {
    const lines = this.decisions.splitLines(row.amountCents, effective)
    const categoryId = lines.length > 0 ? null : effective.categoryId
    const unsure = !effective.categoryDecided && row.suggestionNeedsReview

    const transaction = await Transaction.create(
      {
        ...this.bankFields(row),
        householdId: household.id,
        accountId: account.id,
        kind: row.amountCents < 0 ? 'expense' : 'income',
        amountCents: row.amountCents,
        currencyCode: account.currencyCode,
        payee: payeeOf(row, effective),
        description: null,
        categoryId,
        isSplit: lines.length > 0,
        paidByUserId: effective.paidByUserId,
        needsReview: row.isFutureDated || (categoryId === null && lines.length === 0) || unsure,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      },
      { client: trx }
    )
    if (lines.length > 0) {
      await TransactionSplit.createMany(
        lines.map((line, index) => ({
          householdId: household.id,
          transactionId: transaction.id,
          categoryId: line.categoryId,
          amountCents: line.amountCents,
          memo: line.memo ?? null,
          sortOrder: index,
        })),
        { client: trx }
      )
    }
    return transaction
  }

  /** Stamps the bank's data on the existing transaction; upgrades a pending import. */
  protected async match({ row, effective }: Applied, trx: TransactionClientContract) {
    const target = await this.decisions.matchTarget(row, effective.matchTransactionId!, trx)
    const upgrade = target.source === 'import' && target.status === 'pending'

    target.useTransaction(trx)
    target.merge({
      bankDate: row.bankDate,
      rawDescription: decodeHtmlEntities(row.descriptionRaw),
      cardSuffix: upgrade ? (row.cardSuffix ?? target.cardSuffix) : (target.cardSuffix ?? row.cardSuffix),
      status: row.isPending ? target.status : 'cleared',
      ...(upgrade && target.paidByUserId === null ? { paidByUserId: effective.paidByUserId } : {}),
    })
    await target.save()

    if (upgrade) {
      await ImportRow.query({ client: trx })
        .where('transaction_id', target.id)
        .whereNot('id', row.id)
        .whereNot('resolution', 'superseded')
        .update({ resolution: 'superseded', updated_at: new Date() })
    }
    return target
  }

  /**
   * Both legs of a transfer: this account's from the row, the other one
   * reused (a standalone movement there, or the other account's row of the
   * same upload) or created. Returns this account's leg.
   */
  protected async transfer(
    household: Household,
    actor: User,
    account: Account,
    { row, effective }: Applied,
    trx: TransactionClientContract
  ) {
    const other = await this.decisions.transferAccount(
      household,
      row,
      effective.transferAccountId!
    )
    const outgoing = row.amountCents < 0
    const transfer = await Transfer.create(
      {
        householdId: household.id,
        date: row.date,
        amountCents: Math.abs(row.amountCents),
        fromAccountId: outgoing ? account.id : other.id,
        toAccountId: outgoing ? other.id : account.id,
        memo: null,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      },
      { client: trx }
    )

    const leg = await Transaction.create(
      {
        ...this.bankFields(row),
        ...transferLeg(household, transfer, actor),
        accountId: account.id,
        amountCents: row.amountCents,
        currencyCode: account.currencyCode,
        paidByUserId: effective.paidByUserId,
      },
      { client: trx }
    )

    const existing = await this.existingLeg(row, other.id, trx)
    if (existing) {
      await TransactionSplit.query({ client: trx }).where('transaction_id', existing.id).delete()
      existing.useTransaction(trx)
      existing.merge({
        kind: 'transfer',
        transferId: transfer.id,
        categoryId: null,
        isSplit: false,
        needsReview: false,
        updatedByUserId: actor.id,
      })
      await existing.save()
      return leg
    }

    const staged = await this.stagedLeg(row, other.id, trx)
    const otherLeg = await Transaction.create(
      {
        ...(staged
          ? this.bankFields(staged)
          : { date: row.date, bankDate: null, rawDescription: null, cardSuffix: null }),
        ...(staged ? {} : { status: 'cleared' as const }),
        ...transferLeg(household, transfer, actor),
        accountId: other.id,
        amountCents: -row.amountCents,
        currencyCode: other.currencyCode,
        paidByUserId: other.ownerUserId,
      },
      { client: trx }
    )
    if (staged) await this.link(staged, otherLeg.id, trx)
    return leg
  }

  /** The standalone movement in the other account the staging step paired with the row. */
  protected async existingLeg(row: ImportRow, otherAccountId: number, trx: TransactionClientContract) {
    if (row.transferLegTransactionId === null) return null
    const leg = await Transaction.query({ client: trx })
      .where('household_id', row.householdId)
      .where('id', row.transferLegTransactionId)
      .where('account_id', otherAccountId)
      .where('amount_cents', -row.amountCents)
      .whereNot('kind', 'transfer')
      .forUpdate()
      .first()
    return leg
  }

  /** The other account's row of the same upload, still open and waiting as a transfer leg. */
  protected async stagedLeg(row: ImportRow, otherAccountId: number, trx: TransactionClientContract) {
    if (row.transferLegHash === null) return null
    return ImportRow.query({ client: trx })
      .where('household_id', row.householdId)
      .where('account_id', otherAccountId)
      .where('external_hash', row.transferLegHash)
      .where('resolution', 'transfer_leg')
      .whereNull('confirmed_at')
      .forUpdate()
      .first()
  }

  /** What the bank says about a movement, for the ledger row it becomes. */
  protected bankFields(row: ImportRow) {
    return {
      date: row.date,
      bankDate: row.bankDate,
      rawDescription: decodeHtmlEntities(row.descriptionRaw),
      cardSuffix: row.cardSuffix,
      status: row.isPending ? ('pending' as const) : ('cleared' as const),
      source: 'import' as const,
    }
  }

  protected async link(row: ImportRow, transactionId: number, trx?: TransactionClientContract) {
    if (trx) row.useTransaction(trx)
    row.merge({ transactionId, confirmedAt: DateTime.now() })
    await row.save()
  }

  /**
   * Rules from what was confirmed. A guess nobody looked at (a suggestion
   * under review the person did not change) teaches nothing; a person's
   * explicit decisions come last so they win over the guesses for the
   * same merchant.
   */
  protected async learn(
    household: Household,
    actor: User,
    applied: Applied[],
    trx: TransactionClientContract
  ) {
    const decisions: Array<LearningDecision & { explicit: boolean }> = []
    const hits: number[] = []

    for (const { row, effective, action } of applied) {
      const ruleId = action === 'transfer' ? row.transferRuleId : row.suggestionRuleId
      if (ruleId !== null) hits.push(ruleId)
      if (action !== 'create' && action !== 'transfer') continue
      if (!effective.decided && row.suggestionNeedsReview && action === 'create') continue

      decisions.push({
        action,
        merchantFullKey: row.merchantFullKey,
        suggested: {
          categoryId: row.suggestedCategoryId,
          transferAccountId: row.suggestedTransferAccountId,
          paidByUserId: row.suggestedPaidByUserId,
          fromRule: action === 'transfer' ? row.transferSignal === 'rule' : row.suggestionSource === 'rule',
        },
        final: {
          categoryId: action === 'create' && effective.splits.length === 0 ? effective.categoryId : null,
          transferAccountId: action === 'transfer' ? effective.transferAccountId : null,
          paidByUserId: effective.paidByUserId,
        },
        learnRule: effective.learnRule,
        explicit: effective.decided,
      })
    }

    decisions.sort((a, b) => Number(a.explicit) - Number(b.explicit))
    await this.learner.learnFromImport(household, actor, decisions, trx)
    await this.learner.recordHits(hits, trx)
  }
}

/** Kind, link and authorship of a transfer leg. */
function transferLeg(household: Household, transfer: Transfer, actor: User) {
  return {
    householdId: household.id,
    kind: 'transfer' as const,
    transferId: transfer.id,
    source: 'import' as const,
    payee: null,
    description: null,
    categoryId: null,
    isSplit: false,
    needsReview: false,
    createdByUserId: actor.id,
    updatedByUserId: actor.id,
  }
}

/** The person's payee, else the rule's or model's, else the bank's merchant or text. */
function payeeOf(row: ImportRow, effective: EffectiveRow) {
  const payee = effective.payee ?? row.nabMerchant ?? row.descriptionNormalized
  return payee.trim().slice(0, 120) || null
}
