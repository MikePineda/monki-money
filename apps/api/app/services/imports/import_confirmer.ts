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
import { FieldError } from '#exceptions/field_error'
import logger from '@adonisjs/core/services/logger'
import RecurringDetector from '#services/recurring/recurring_detector'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import { isHiddenFrom, type PrivacyViewer } from '#domain/ledger/privacy'
import RuleLearner from '#services/rules/rule_learner'
import { decodeHtmlEntities } from '#importers/html_entities'
import type { LearningDecision } from '#domain/importing/learning'
import { linkedHolderKey } from '#domain/importing/linked_accounts'
import ImportDecisions from '#services/imports/import_decisions'
import ImportBookkeeping from '#services/imports/import_bookkeeping'
import { ImportBatchClosed, ImportRowsUndecided } from '#exceptions/errors'
import {
  type EffectiveRow,
  effectiveRow,
  isGuessedTransfer,
  reviewRowOf,
} from '#services/imports/effective_row'
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
 *
 * Once committed, recurring payments are detected again over the new
 * ledger (best effort: a failure there is logged, never the confirm's).
 */
@inject()
export default class ImportConfirmer {
  constructor(
    protected decisions: ImportDecisions,
    protected learner: RuleLearner,
    protected bookkeeping: ImportBookkeeping,
    protected recurring: RecurringDetector
  ) {}

  async confirm(
    household: Household,
    actor: User,
    batchId: number,
    input: ConfirmInput,
    mode: ConfirmMode
  ): Promise<ConfirmResult> {
    await findInHousehold(ImportBatch, household, batchId)

    const result = await this.confirmInTransaction(household, actor, batchId, input, mode)
    await this.detectRecurring(household)
    return result
  }

  /** Recurring payments over the ledger the confirm just wrote; never fails the confirm. */
  protected async detectRecurring(household: Household) {
    try {
      await this.recurring.detect(household)
    } catch (error) {
      logger.warn(
        { err: error, householdId: household.id },
        'import confirm: recurring payment detection failed'
      )
    }
  }

  protected async confirmInTransaction(
    household: Household,
    actor: User,
    batchId: number,
    input: ConfirmInput,
    mode: ConfirmMode
  ): Promise<ConfirmResult> {
    return db.transaction(async (trx) => {
      const batch = await this.lockBatch(household, batchId, trx)
      if (!batch.isStaged) throw new ImportBatchClosed()
      const viewer = await privacyViewer(household, actor)

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

      assertOneRowPerMatch(selected)
      const tally: Tally = { created: 0, matched: 0, ignored: 0, transfers: 0 }
      for (const entry of selected) {
        if (entry.row.decidedAt !== null) {
          await this.decisions.validate(household, entry.row, trx)
        }
        await this.apply(household, actor, account, entry, tally, viewer, trx)
      }

      await this.learn(household, actor, selected, trx)

      if (batch.openingBalanceCents !== null && account.openingBalanceDate === null) {
        const opening = await this.bookkeeping.derivedOpening(batch, trx)
        account.useTransaction(trx)
        account.merge({ openingBalanceCents: opening.cents, openingBalanceDate: opening.date })
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

  /**
   * Locks the batch, and with it the other staged batches of the same
   * upload in id order: their rows link to each other's transfer legs, so
   * two confirms of one upload always queue instead of deadlocking.
   */
  protected async lockBatch(household: Household, batchId: number, trx: TransactionClientContract) {
    const target = await ImportBatch.query({ client: trx })
      .where('household_id', household.id)
      .where('id', batchId)
      .firstOrFail()
    const locked = await ImportBatch.query({ client: trx })
      .where('household_id', household.id)
      .where((query) =>
        query
          .where('id', batchId)
          .orWhere((upload) => upload.where('file_hash', target.fileHash).where('status', 'staged'))
      )
      .orderBy('id')
      .forUpdate()
    return locked.find((batch) => batch.id === batchId)!
  }

  protected async apply(
    household: Household,
    actor: User,
    account: Account,
    entry: Applied,
    tally: Tally,
    viewer: PrivacyViewer,
    trx: TransactionClientContract
  ) {
    switch (entry.action) {
      case 'create': {
        const created = await this.create(household, actor, account, entry, trx)
        await this.link(entry.row, created.id)
        tally.created++
        return
      }
      case 'match': {
        const matched = await this.match(entry, trx)
        await this.link(entry.row, matched.id)
        tally.matched++
        return
      }
      case 'transfer': {
        const leg = await this.transfer(household, actor, account, entry, viewer, trx)
        await this.link(entry.row, leg.id)
        tally.transfers++
        return
      }
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

  /**
   * Stamps the bank's data on the existing transaction, whose status now
   * mirrors the bank (pending while the bank row is). When the transaction
   * was matched before to a row that was still pending (an import, or a
   * hand entry), this posted copy upgrades it and that row is `superseded`.
   */
  protected async match({ row, effective }: Applied, trx: TransactionClientContract) {
    const target = await this.decisions.matchTarget(row, effective.matchTransactionId!, trx)
    const pendingRows = await ImportRow.query({ client: trx })
      .where('transaction_id', target.id)
      .where('account_id', row.accountId)
      .whereNot('id', row.id)
      .whereNot('resolution', 'superseded')
      .where('is_pending', true)
    const upgrade = pendingRows.length > 0 || target.source === 'import'

    target.useTransaction(trx)
    target.merge({
      bankDate: row.bankDate,
      rawDescription: decodeHtmlEntities(row.descriptionRaw),
      cardSuffix: upgrade
        ? (row.cardSuffix ?? target.cardSuffix)
        : (target.cardSuffix ?? row.cardSuffix),
      status: row.isPending ? 'pending' : 'cleared',
      ...(upgrade && target.paidByUserId === null ? { paidByUserId: effective.paidByUserId } : {}),
    })
    await target.save()

    if (pendingRows.length > 0) {
      await ImportRow.query({ client: trx })
        .whereIn(
          'id',
          pendingRows.map((pending) => pending.id)
        )
        .update({ resolution: 'superseded', updated_at: new Date() })
    }
    return target
  }

  /**
   * Both legs of a transfer: this account's from the row, the other one
   * reused (a standalone movement there, or the other account's row of the
   * same upload) or created. Returns this account's leg. Legs to an
   * account the importer guessed and nobody checked stay in review.
   */
  protected async transfer(
    household: Household,
    actor: User,
    account: Account,
    { row, effective }: Applied,
    viewer: PrivacyViewer,
    trx: TransactionClientContract
  ) {
    const other = await this.decisions.transferAccount(household, row, effective.transferAccountId!)
    const unsure = isGuessedTransfer(row, effective)
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
        ...transferLeg(household, transfer, actor, unsure),
        accountId: account.id,
        amountCents: row.amountCents,
        currencyCode: account.currencyCode,
        paidByUserId: effective.paidByUserId,
      },
      { client: trx }
    )

    // Another member's private row is never turned into a leg (it would be rewritten).
    const found = await this.existingLeg(row, other.id, trx)
    const existing = found && !isHiddenFrom(found, viewer) ? found : null
    if (existing) {
      await TransactionSplit.query({ client: trx }).where('transaction_id', existing.id).delete()
      existing.useTransaction(trx)
      existing.merge({
        kind: 'transfer',
        transferId: transfer.id,
        categoryId: null,
        isSplit: false,
        needsReview: unsure,
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
        ...transferLeg(household, transfer, actor, unsure),
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
  protected async existingLeg(
    row: ImportRow,
    otherAccountId: number,
    trx: TransactionClientContract
  ) {
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
  protected async stagedLeg(
    row: ImportRow,
    otherAccountId: number,
    trx: TransactionClientContract
  ) {
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
   * under review, or a guessed transfer account, the person did not
   * change) teaches nothing; a person's explicit decisions come last so
   * they win over the guesses for the same merchant.
   *
   * An internal transfer that names its linked holder teaches the holder's
   * rule (`linkedHolderKey`) instead of its merchant key: the memo NAB
   * shows changes from one transfer to the next, the holder does not. It
   * teaches even when a rule proposed the account, since the bank's
   * generic `Linked Acc Trns` rule says nothing about the holder, but it
   * never replaces a rule on that key that names a category.
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
      if (action === 'transfer' && isGuessedTransfer(row, effective)) continue

      const holderKey =
        action === 'transfer'
          ? linkedHolderKey({
              details: decodeHtmlEntities(row.descriptionRaw),
              nabCategory: row.nabCategory,
            })
          : null
      decisions.push({
        action,
        merchantFullKey: holderKey ?? row.merchantFullKey,
        suggested: {
          categoryId: row.suggestedCategoryId,
          transferAccountId: row.suggestedTransferAccountId,
          paidByUserId: row.suggestedPaidByUserId,
          fromRule:
            action === 'transfer'
              ? holderKey === null && row.transferSignal === 'rule'
              : row.suggestionSource === 'rule',
        },
        final: {
          categoryId:
            action === 'create' && effective.splits.length === 0 ? effective.categoryId : null,
          transferAccountId: action === 'transfer' ? effective.transferAccountId : null,
          paidByUserId: effective.paidByUserId,
        },
        learnRule: effective.learnRule,
        linkedHolder: holderKey !== null,
        explicit: effective.decided,
      })
    }

    decisions.sort((a, b) => Number(a.explicit) - Number(b.explicit))
    await this.learner.learnFromImport(household, actor, decisions, trx)
    await this.learner.recordHits(hits, trx)
  }
}

/** Two rows linked to one transaction would count the bank twice (422 `claimed`). */
function assertOneRowPerMatch(selected: Applied[]) {
  const targets = selected
    .filter((entry) => entry.action === 'match')
    .map((entry) => entry.effective.matchTransactionId)
  if (new Set(targets).size !== targets.length) {
    throw new FieldError('matchTransactionId', 'claimed')
  }
}

/**
 * Kind, link and authorship of a transfer leg. `needsReview` when the other
 * account was the importer's guess and nobody checked it.
 */
function transferLeg(household: Household, transfer: Transfer, actor: User, needsReview: boolean) {
  return {
    householdId: household.id,
    kind: 'transfer' as const,
    transferId: transfer.id,
    source: 'import' as const,
    payee: null,
    description: null,
    categoryId: null,
    isSplit: false,
    needsReview,
    createdByUserId: actor.id,
    updatedByUserId: actor.id,
  }
}

/** The person's payee, else the rule's or model's, else the bank's merchant or text. */
function payeeOf(row: ImportRow, effective: EffectiveRow) {
  const payee = effective.payee ?? row.nabMerchant ?? row.descriptionNormalized
  return payee.trim().slice(0, 120) || null
}
