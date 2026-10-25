import { DateTime } from 'luxon'
import Clock from '#services/clock'
import type User from '#models/user'
import Account from '#models/account'
import { inject } from '@adonisjs/core'
import { createHash } from 'node:crypto'
import { entitlementsFor } from '#config/plans'
import ImportBatch from '#models/import_batch'
import type Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import { todayIn } from '#domain/calendar/month'
import { addDays } from '#domain/importing/iso_days'
import { CsvEmptyError } from '#importers/errors'
import { FieldError } from '#exceptions/field_error'
import { parseBankCsv } from '#importers/registry'
import { stageRows } from '#domain/importing/staging'
import type { StageInput } from '#services/imports/dto'
import ImportArchive from '#services/imports/import_archive'
import { openingBalanceCents } from '#domain/importing/balance_chain'
import { groupByAccountNumber } from '#domain/importing/account_grouping'
import ImportBookkeeping from '#services/imports/import_bookkeeping'
import LedgerReferences from '#services/ledger/ledger_references'
import { stagingSuggester } from '#services/imports/suggester_chains'
import SystemRulesSeeder from '#services/rules/system_rules_seeder'
import ImportContextLoader from '#services/imports/import_context_loader'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { defaultResolverSteps, resolveRows } from '#domain/importing/resolver_steps'
import type { ImportSource, ParsedRow, ResolvedRow, StagedRow } from '#domain/importing/types'
import { ImportBatchOpen, ImportLimitReached, ImportUnknownAccounts } from '#exceptions/errors'

/** Rows per INSERT (Postgres allows 65 535 parameters per statement). */
const INSERT_CHUNK = 500

interface AccountPlan {
  account: Account
  rows: ParsedRow[]
  staged: StagedRow[]
  /** Hashes already imported for the account, with the ledger row each became. */
  existing: ReadonlyMap<string, number | null>
  resolved: ResolvedRow[]
  /** Dates of the ledger rows the matcher may link (for the opening date). */
  candidateDates: ReadonlyMap<number, string>
}

/**
 * `POST /imports`: parses a bank export, splits it by `Account Number` and
 * stages one batch per account through the pure pipeline
 * (stage -> resolve: duplicates, zero amounts, transfers, matches,
 * category suggestions), with no model call. Nothing reaches the ledger
 * until confirm.
 */
@inject()
export default class ImportStager {
  constructor(
    protected loader: ImportContextLoader,
    protected references: LedgerReferences,
    protected bookkeeping: ImportBookkeeping,
    protected archive: ImportArchive,
    protected systemRules: SystemRulesSeeder,
    protected clock: Clock
  ) {}

  async stage(household: Household, actor: User, input: StageInput): Promise<ImportBatch[]> {
    const parsed = parseBankCsv(input.buffer)
    if (parsed.rows.length === 0) throw new CsvEmptyError()
    const groups = groupByAccountNumber(parsed.rows)

    const { accounts, mapNumber } = await this.accountsFor(household, groups, input.accountId)
    await this.assertWithinPlan(household, groups.size)
    await this.assertNoOpenBatch(household, [...accounts.values()])

    // The household's first import brings the bank defaults for its accounts.
    const firstImport = !(await ImportBatch.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .first())
    if (firstImport) await this.systemRules.seed(household.id)

    const plans = await this.resolve(household, actor, groups, accounts)
    const fileHash = createHash('sha256').update(input.buffer).digest('hex')

    const batchIds = await db.transaction(async (trx) => {
      const ids: number[] = []
      for (const plan of plans) {
        const batch = await this.persist(household, actor, plan, trx, {
          source: parsed.source,
          fileName: input.fileName,
          fileHash,
        })
        ids.push(batch.id)
      }
      if (mapNumber) {
        const [[number, account]] = [...accounts.entries()]
        account.useTransaction(trx)
        account.externalAccountNumber = number
        await account.save()
      }
      return ids
    })

    const key = await this.archive.store(household.id, batchIds[0], input.buffer)
    if (key) await ImportBatch.query().whereIn('id', batchIds).update({ file_path: key })

    return ImportBatch.query().whereIn('id', batchIds).orderBy('id')
  }

  /**
   * Accounts by bank number. With `accountId` the whole file goes to that
   * account (one number only) and the number is remembered; otherwise every
   * number must already be mapped (422 with the unknown ones).
   */
  protected async accountsFor(
    household: Household,
    groups: Map<string, ParsedRow[]>,
    accountId: number | undefined
  ): Promise<{ accounts: Map<string, Account>; mapNumber: boolean }> {
    const numbers = [...groups.keys()]

    if (accountId !== undefined) {
      const account = await this.references.account(household, accountId)
      if (numbers.length > 1) throw new FieldError('accountId', 'oneAccountOnly')
      const [number] = numbers
      const owner = await Account.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .where('external_account_number', number)
        .first()
      const mismatch =
        (account.externalAccountNumber !== null && account.externalAccountNumber !== number) ||
        (owner !== null && owner.id !== account.id)
      if (mismatch) throw new FieldError('accountId', 'accountNumberMismatch')
      return {
        accounts: new Map([[number, account]]),
        mapNumber: account.externalAccountNumber === null,
      }
    }

    const accounts = await Account.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .whereIn('external_account_number', numbers)
      .preload('cards')
    const byNumber = new Map(accounts.map((account) => [account.externalAccountNumber!, account]))
    const unknown = numbers.filter((number) => !byNumber.has(number))
    if (unknown.length > 0) throw new ImportUnknownAccounts({ accountNumbers: unknown })
    return { accounts: byNumber, mapNumber: false }
  }

  /** Plan limit: batches created this calendar month (household time zone). */
  protected async assertWithinPlan(household: Household, newBatches: number) {
    const limit = entitlementsFor(household.plan).importsPerMonth
    const monthStart = this.clock.now().setZone(household.timezone).startOf('month')
    const [row] = await ImportBatch.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('created_at', '>=', monthStart.toUTC().toISO()!)
      .count('* as total')
    if (Number(row.$extras['total']) + newBatches > limit) throw new ImportLimitReached()
  }

  /** One staged batch per account: the review of the previous upload comes first. */
  protected async assertNoOpenBatch(household: Household, accounts: Account[]) {
    const open = await ImportBatch.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .whereIn(
        'account_id',
        accounts.map((account) => account.id)
      )
      .where('status', 'staged')
      .orderBy('id')
      .first()
    if (open) throw new ImportBatchOpen({ batchId: open.id, accountId: open.accountId })
  }

  /** Stages every account first: a row of one may be the other leg of another's transfer. */
  protected async resolve(
    household: Household,
    actor: User,
    groups: Map<string, ParsedRow[]>,
    accounts: Map<string, Account>
  ): Promise<AccountPlan[]> {
    const today = todayIn(this.clock.now(), household.timezone)
    const [rules, categoryIdBySlug, householdAccounts, linkedHolders] = await Promise.all([
      this.loader.rules(household),
      this.loader.categoryIdBySlug(household),
      this.loader.accounts(household),
      this.loader.linkedHolders(household),
    ])
    const suggester = stagingSuggester(rules, categoryIdBySlug)

    const plans: AccountPlan[] = []
    for (const [number, rows] of groups) {
      const account = accounts.get(number)!
      if (!account.$preloaded['cards']) await account.load('cards')
      const staged = stageRows(rows, {
        accountId: account.id,
        today,
        payers: this.loader.payers(account),
      })
      const existing = await this.loader.existingHashes(household, account.id, staged)
      plans.push({ account, rows, staged, existing, resolved: [], candidateDates: new Map() })
    }

    for (const plan of plans) {
      const otherStaged = plans
        .filter((other) => other !== plan)
        .flatMap((other) => other.staged.filter((row) => !other.existing.has(row.externalHash)))
      const context = await this.loader.context(household, plan.account.id, plan.staged, {
        existingHashes: new Set(plan.existing.keys()),
        rules,
        accounts: householdAccounts,
        linkedHolders,
        otherStaged,
        actorId: actor.id,
      })
      plan.candidateDates = new Map(
        context.candidates.map((candidate) => [candidate.id, candidate.date])
      )
      plan.resolved = await resolveRows(plan.staged, context, defaultResolverSteps(suggester))
    }
    return plans
  }

  protected async persist(
    household: Household,
    actor: User,
    plan: AccountPlan,
    trx: TransactionClientContract,
    file: { source: ImportSource; fileName: string | null; fileHash: string }
  ): Promise<ImportBatch> {
    const { account, rows } = plan
    // Duplicates are stored too, settled: listed for the review, never confirmed.
    const reviewable = plan.resolved.filter((resolved) => resolved.resolution !== 'duplicate')
    const bankDates = rows.map((row) => row.bankDate).sort()
    const asOf = bankDates.at(-1)!

    const previous = await ImportBatch.query({ client: trx })
      .where('account_id', account.id)
      .whereNot('status', 'cancelled')
      .first()
    const firstImport =
      previous === null && account.openingBalanceDate === null && account.openingBalanceCents === 0
    const opening = firstImport ? openingBalanceCents(rows) : null
    // Matched ledger rows dated before the oldest bank row must count after the opening.
    const matchedDates = reviewable.flatMap((resolved) =>
      resolved.matchTransactionId === null
        ? []
        : [plan.candidateDates.get(resolved.matchTransactionId) ?? resolved.row.date]
    )
    const earliest = [...plan.staged.flatMap((row) => [row.date, row.bankDate]), ...matchedDates]
      .sort()
      .at(0)!

    const ledger = await this.bookkeeping.ledgerBalance(account, asOf, {
      opening: opening === null ? undefined : { cents: opening, date: addDays(earliest, -1) },
      client: trx,
    })
    const projected = reviewable
      .filter(addsToTheLedger)
      .reduce((total, resolved) => total + resolved.row.amountCents, ledger)

    const batch = await ImportBatch.create(
      {
        householdId: household.id,
        accountId: account.id,
        uploadedByUserId: actor.id,
        source: file.source,
        status: 'staged',
        fileName: file.fileName?.slice(0, 255) ?? null,
        fileHash: file.fileHash,
        dateFrom: bankDates[0],
        dateTo: asOf,
        rowCount: rows.length,
        duplicateCount: plan.resolved.length - reviewable.length,
        // Rows are newest first: the first balance is the bank's latest.
        expectedBalanceCents: rows.find((row) => row.balanceCents !== null)?.balanceCents ?? null,
        computedBalanceCents: projected,
        openingBalanceCents: opening,
      },
      { client: trx }
    )

    const now = new Date()
    for (let offset = 0; offset < plan.resolved.length; offset += INSERT_CHUNK) {
      await trx
        .insertQuery()
        .table('import_rows')
        .multiInsert(
          plan.resolved
            .slice(offset, offset + INSERT_CHUNK)
            .map((resolved) => rowValues(batch, resolved, now, plan.existing))
        )
    }

    await staleFlagged(plan, batch, trx)
    await this.bookkeeping.refreshCounts(batch, trx)
    if (reviewable.length === 0) {
      // Nothing to review (a re-upload of rows already imported).
      batch.merge({ status: 'completed', completedAt: DateTime.now() })
      await batch.save()
    }
    return batch
  }
}

/**
 * Ledger rows still pending from an earlier export of this account whose
 * bank row is gone from this one although its dates are covered, and that
 * no row of this export claims (its posted copy would): a hold the bank
 * dropped or changed. They go to review (`needs_review`) so nobody keeps
 * counting money that will never leave.
 */
async function staleFlagged(
  plan: AccountPlan,
  batch: ImportBatch,
  trx: TransactionClientContract
): Promise<void> {
  const hashes = plan.staged.map((row) => row.externalHash)
  const claimed = plan.resolved.flatMap((resolved) =>
    resolved.matchTransactionId === null ? [] : [resolved.matchTransactionId]
  )
  const stale = trx
    .from('transactions')
    .join('import_rows', (join) =>
      join
        .on('import_rows.transaction_id', '=', 'transactions.id')
        .andOn('import_rows.account_id', '=', 'transactions.account_id')
    )
    .where('transactions.account_id', batch.accountId)
    .where('transactions.status', 'pending')
    .where('import_rows.is_pending', true)
    .whereNot('import_rows.resolution', 'superseded')
    .whereNot('import_rows.import_batch_id', batch.id)
    .whereBetween('import_rows.bank_date', [batch.dateFrom!, batch.dateTo!])
    .whereNotIn('import_rows.external_hash', hashes)
    .if(claimed.length > 0, (query) => query.whereNotIn('transactions.id', claimed))
    .select('transactions.id')

  await trx
    .from('transactions')
    .whereIn('id', stale)
    .where('needs_review', false)
    .update({ needs_review: true, updated_at: new Date() })
}

/** Rows that become a new ledger row of this account on confirm (as proposed). */
function addsToTheLedger(resolved: ResolvedRow) {
  return (
    resolved.resolution === 'new' ||
    resolved.resolution === 'transfer_leg' ||
    (resolved.resolution === 'needs_confirmation' && resolved.matchTransactionId === null)
  )
}

/**
 * `ResolvedRow` -> `import_rows` columns (see docs/import-pipeline.md). A
 * duplicate is settled at once (`confirmed_at`) and points at the ledger
 * row its stored copy became (`match_transaction_id`), so the review shows
 * what is already there.
 */
function rowValues(
  batch: ImportBatch,
  resolved: ResolvedRow,
  now: Date,
  existing: ReadonlyMap<string, number | null>
) {
  const { row, suggestion, transfer } = resolved
  const duplicate = resolved.resolution === 'duplicate'
  return {
    import_batch_id: batch.id,
    household_id: batch.householdId,
    account_id: batch.accountId,
    row_index: row.rowIndex,
    occurrence: row.occurrence,
    external_hash: row.externalHash,
    raw: JSON.stringify(row.raw),
    bank_date: row.bankDate,
    date: row.date,
    processed_on: row.processedOn,
    amount_cents: row.amountCents,
    balance_cents: row.balanceCents,
    transaction_type: row.transactionType.slice(0, 80),
    description_raw: row.detailsRaw,
    description_normalized: row.descriptionNormalized,
    merchant_key: row.merchantKey.slice(0, 255),
    merchant_full_key: row.merchantFullKey.slice(0, 255),
    nab_category: row.nabCategory?.slice(0, 120) ?? null,
    nab_merchant: row.nabMerchant?.slice(0, 255) ?? null,
    card_suffix: row.cardSuffix,
    is_pending: row.isPending,
    is_future_dated: row.isFutureDated,
    resolution: resolved.resolution,
    proposed_resolution: resolved.resolution,
    needs_review: resolved.needsReview,
    reasons: JSON.stringify(resolved.reasons),
    match_transaction_id: duplicate
      ? (existing.get(row.externalHash) ?? null)
      : resolved.matchTransactionId,
    match_score: resolved.matchScore,
    upgrades_pending: resolved.upgradesPendingTransaction,
    suggested_category_id: suggestion?.categoryId ?? null,
    suggestion_source: suggestion?.source ?? null,
    suggestion_confidence: suggestion?.confidence ?? null,
    suggestion_needs_review: suggestion?.needsReview ?? false,
    suggestion_rule_id: suggestion?.ruleId ?? null,
    suggested_payee: suggestion?.payee?.slice(0, 120) ?? null,
    suggested_transfer_account_id: transfer?.counterpartAccountId ?? null,
    transfer_signal: transfer?.signal ?? null,
    transfer_rule_id: transfer?.ruleId ?? null,
    transfer_leg_transaction_id: transfer?.oppositeLeg?.transactionId ?? null,
    transfer_leg_hash: transfer?.oppositeLeg?.externalHash ?? null,
    transfer_candidate_account_ids: JSON.stringify(transfer?.candidateAccountIds ?? []),
    suggested_paid_by_user_id: resolved.paidByUserId,
    confirmed_at: duplicate ? now : null,
    created_at: now,
    updated_at: now,
  }
}
