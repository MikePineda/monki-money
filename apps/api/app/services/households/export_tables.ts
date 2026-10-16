import Account from '#models/account'
import Payslip from '#models/payslip'
import Category from '#models/category'
import Transfer from '#models/transfer'
import ImportRow from '#models/import_row'
import db from '@adonisjs/lucid/services/db'
import type Household from '#models/household'
import Transaction from '#models/transaction'
import AccountCard from '#models/account_card'
import ImportBatch from '#models/import_batch'
import SavingsGoal from '#models/savings_goal'
import MerchantRule from '#models/merchant_rule'
import RecurringItem from '#models/recurring_item'
import CategoryGroup from '#models/category_group'
import MonthlyInsight from '#models/monthly_insight'
import HouseholdMember from '#models/household_member'
import TransactionSplit from '#models/transaction_split'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import { isHiddenFrom, type PrivacyViewer } from '#domain/ledger/privacy'
import HouseholdOwnershipTransfer from '#models/household_ownership_transfer'

/**
 * The tables of a household export ("download my data"), shared by the
 * JSON export (one array per table) and the CSV zip (one file per table),
 * so both always carry the same rows and columns.
 *
 * - Every query is scoped to the household (`forHousehold`, or through its
 *   accounts for cards): another household's rows never appear.
 * - Rows are read page by page in id order with a keyset (`id > last`), so
 *   memory stays flat as tables grow and rows added or deleted while the
 *   export runs never shift a page (no duplicates, no gaps).
 * - Nothing secret leaves: no password hashes, tokens, invitation links or
 *   storage keys, and import rows carry their resolution, never the bank
 *   file's cells.
 * - The privacy rule of the API holds (app/domain/ledger/privacy.ts): the
 *   partner's private transactions keep their amount but lose payee, notes,
 *   category, tags and split lines, and whatever else would reveal them
 *   (their payslip line's category and memo, the payslip's memo where it
 *   was copied to its transfer and legs, their import row's decision).
 */

/** A value of an exported row: what JSON can carry. */
export type ExportValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | Record<string, unknown>
  | readonly Record<string, unknown>[]

export type ExportRow = Record<string, ExportValue>

export interface ExportTable {
  /** Key of the table's array in the JSON export. */
  name: string
  /** File name in the CSV zip. */
  file: string
  /** Column order: the CSV header and the keys of every row. */
  columns: readonly string[]
  rows(): AsyncIterable<ExportRow>
}

const PAGE_SIZE = 500

/** Ties a table's rows to its declared columns at compile time. */
function table<const Columns extends readonly string[]>(
  name: string,
  file: string,
  columns: Columns,
  rows: () => AsyncIterable<{ [Column in Columns[number]]: ExportValue }>
): ExportTable {
  return { name, file, columns, rows }
}

/**
 * Pages of `load(afterId, limit)` in id order, each row shaped by `shape`
 * (null leaves a row out without breaking the keyset).
 */
async function* keyset<Model extends { id: number }, Row>(
  pageSize: number,
  load: (afterId: number, limit: number) => Promise<Model[]>,
  shape: (row: Model) => Row | null
): AsyncGenerator<Row> {
  let afterId = 0
  for (;;) {
    const page = await load(afterId, pageSize)
    for (const model of page) {
      const row = shape(model)
      if (row !== null) yield row
    }
    if (page.length < pageSize) return
    afterId = page[page.length - 1].id
  }
}

/** The fields the privacy rule reads, for preloads that need nothing else. */
const PRIVACY_COLUMNS = ['id', 'is_private', 'paid_by_user_id', 'created_by_user_id']

/**
 * Memos of payslips whose gross line `viewer` may not see, by the transfer
 * they were copied to: a payslip that creates its transfer gives it its
 * memo, and the transfer gives it to both legs' description. Read in
 * pages; only (transfer id, memo) pairs of private payslips are kept.
 */
export async function hiddenPayslipMemos(
  household: Household,
  viewer: PrivacyViewer,
  pageSize = PAGE_SIZE
): Promise<Map<number, string>> {
  const memos = new Map<number, string>()
  const pages = keyset(
    pageSize,
    (afterId, limit) =>
      Payslip.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .whereNotNull('transfer_id')
        .whereNotNull('memo')
        .preload('lines', (query) =>
          query.where('kind', 'income').select([...PRIVACY_COLUMNS, 'kind', 'payslip_id'])
        )
        .where('id', '>', afterId)
        .orderBy('id')
        .limit(limit),
    (payslip) => {
      const gross = payslip.lines[0]
      return gross && isHiddenFrom(gross, viewer)
        ? { transferId: payslip.transferId!, memo: payslip.memo! }
        : null
    }
  )
  for await (const { transferId, memo } of pages) memos.set(transferId, memo)
  return memos
}

/** `text`, unless it is the memo of a private payslip copied onto that transfer. */
export function unlessPayslipMemo(
  text: string | null,
  transferId: number | null,
  memos: ReadonlyMap<number, string>
) {
  return text !== null && transferId !== null && memos.get(transferId) === text ? null : text
}

/** The household itself, as the single row of `household.csv`. */
export function householdRow(household: Household) {
  return {
    id: household.id,
    name: household.name,
    plan: household.plan,
    status: household.status,
    currencyCode: household.currencyCode,
    locale: household.locale,
    timezone: household.timezone,
    settings: household.settings as Record<string, unknown>,
    createdAt: isoTimestamp(household.createdAt),
  }
}

export function exportTables(
  household: Household,
  viewer: PrivacyViewer,
  pageSize = PAGE_SIZE
): ExportTable[] {
  // Read once, when the first table that needs it starts.
  let memos: Promise<Map<number, string>> | null = null
  const payslipMemos = () => (memos ??= hiddenPayslipMemos(household, viewer, pageSize))

  return [
    table(
      'members',
      'members.csv',
      ['id', 'userId', 'fullName', 'email', 'role', 'displayName', 'color', 'joinedAt'],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            HouseholdMember.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .preload('user')
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (member) => ({
            id: member.id,
            userId: member.userId,
            fullName: member.user.fullName,
            email: member.user.email,
            role: member.role,
            displayName: member.displayName,
            color: member.color,
            joinedAt: isoTimestamp(member.joinedAt),
          })
        )
    ),

    table(
      'accounts',
      'accounts.csv',
      [
        'id',
        'name',
        'institution',
        'kind',
        'ownerUserId',
        'currencyCode',
        'externalAccountNumber',
        'openingBalanceCents',
        'openingBalanceDate',
        'isActive',
        'sortOrder',
        'createdByUserId',
        'createdAt',
      ],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            Account.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (account) => ({
            id: account.id,
            name: account.name,
            institution: account.institution,
            kind: account.kind,
            ownerUserId: account.ownerUserId,
            currencyCode: account.currencyCode,
            externalAccountNumber: account.externalAccountNumber,
            openingBalanceCents: account.openingBalanceCents,
            openingBalanceDate: account.openingBalanceDate,
            isActive: account.isActive,
            sortOrder: account.sortOrder,
            createdByUserId: account.createdByUserId,
            createdAt: isoTimestamp(account.createdAt),
          })
        )
    ),

    table(
      'accountCards',
      'account_cards.csv',
      ['id', 'accountId', 'cardSuffix', 'userId', 'label', 'createdAt'],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            AccountCard.query()
              // Cards carry no household_id: scoped through their account.
              .whereIn(
                'account_id',
                Account.query()
                  .withScopes((scopes) => scopes.forHousehold(household))
                  .select('id')
              )
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (card) => ({
            id: card.id,
            accountId: card.accountId,
            cardSuffix: card.cardSuffix,
            userId: card.userId,
            label: card.label,
            createdAt: isoTimestamp(card.createdAt),
          })
        )
    ),

    table(
      'categoryGroups',
      'category_groups.csv',
      ['id', 'slug', 'name', 'kind', 'isHidden', 'isSystem', 'sortOrder'],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            CategoryGroup.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (group) => ({
            id: group.id,
            slug: group.slug,
            name: group.name,
            kind: group.kind,
            isHidden: group.isHidden,
            isSystem: group.isSystem,
            sortOrder: group.sortOrder,
          })
        )
    ),

    table(
      'categories',
      'categories.csv',
      ['id', 'categoryGroupId', 'slug', 'name', 'icon', 'isHidden', 'isSystem', 'sortOrder'],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            Category.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (category) => ({
            id: category.id,
            categoryGroupId: category.categoryGroupId,
            slug: category.slug,
            name: category.name,
            icon: category.icon,
            isHidden: category.isHidden,
            isSystem: category.isSystem,
            sortOrder: category.sortOrder,
          })
        )
    ),

    table(
      'transfers',
      'transfers.csv',
      [
        'id',
        'date',
        'amountCents',
        'fromAccountId',
        'toAccountId',
        'memo',
        'createdByUserId',
        'createdAt',
      ],
      async function* () {
        const hidden = await payslipMemos()
        yield* keyset(
          pageSize,
          (afterId, limit) =>
            Transfer.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (transfer) => ({
            id: transfer.id,
            date: transfer.date,
            amountCents: transfer.amountCents,
            fromAccountId: transfer.fromAccountId,
            toAccountId: transfer.toAccountId,
            memo: unlessPayslipMemo(transfer.memo, transfer.id, hidden),
            createdByUserId: transfer.createdByUserId,
            createdAt: isoTimestamp(transfer.createdAt),
          })
        )
      }
    ),

    table(
      'transactions',
      'transactions.csv',
      [
        'id',
        'accountId',
        'kind',
        'date',
        'bankDate',
        'amountCents',
        'currencyCode',
        'payee',
        'description',
        'rawDescription',
        'categoryId',
        'isSplit',
        'tags',
        'transferId',
        'payslipId',
        'paidByUserId',
        'status',
        'source',
        'needsReview',
        'cardSuffix',
        'isPrivate',
        'isMasked',
        'createdByUserId',
        'createdAt',
      ],
      async function* () {
        const hidden = await payslipMemos()
        yield* keyset(
          pageSize,
          (afterId, limit) =>
            Transaction.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (transaction) => {
            const masked = isHiddenFrom(transaction, viewer)
            return {
              id: transaction.id,
              accountId: transaction.accountId,
              kind: transaction.kind,
              date: transaction.date,
              bankDate: transaction.bankDate,
              amountCents: transaction.amountCents,
              currencyCode: transaction.currencyCode,
              payee: masked ? null : transaction.payee,
              description: masked
                ? null
                : unlessPayslipMemo(transaction.description, transaction.transferId, hidden),
              rawDescription: masked ? null : transaction.rawDescription,
              categoryId: masked ? null : transaction.categoryId,
              isSplit: masked ? false : transaction.isSplit,
              tags: masked ? [] : transaction.tags,
              transferId: transaction.transferId,
              payslipId: transaction.payslipId,
              paidByUserId: transaction.paidByUserId,
              status: transaction.status,
              source: transaction.source,
              needsReview: masked ? false : transaction.needsReview,
              cardSuffix: transaction.cardSuffix,
              isPrivate: transaction.isPrivate,
              isMasked: masked,
              createdByUserId: transaction.createdByUserId,
              createdAt: isoTimestamp(transaction.createdAt),
            }
          }
        )
      }
    ),

    table(
      'transactionSplits',
      'transaction_splits.csv',
      ['id', 'transactionId', 'categoryId', 'amountCents', 'memo', 'sortOrder'],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            TransactionSplit.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .preload('transaction', (query) => query.select(PRIVACY_COLUMNS))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          // A private transaction's lines would tell what it was: left out.
          (line) =>
            isHiddenFrom(line.transaction, viewer)
              ? null
              : {
                  id: line.id,
                  transactionId: line.transactionId,
                  categoryId: line.categoryId,
                  amountCents: line.amountCents,
                  memo: line.memo,
                  sortOrder: line.sortOrder,
                }
        )
    ),

    table(
      'payslips',
      'payslips.csv',
      [
        'id',
        'accountId',
        'userId',
        'date',
        'grossCents',
        'netCents',
        'deductionsCents',
        'memo',
        'transferId',
        'createdByUserId',
        'createdAt',
      ],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            Payslip.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .preload('lines', (query) => query.select([...PRIVACY_COLUMNS, 'kind', 'payslip_id']))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (payslip) => {
            // The memo goes with the gross line (as in PayslipTransformer).
            const gross = payslip.lines.find((line) => line.kind === 'income')
            return {
              id: payslip.id,
              accountId: payslip.accountId,
              userId: payslip.userId,
              date: payslip.date,
              grossCents: payslip.grossCents,
              netCents: payslip.netCents,
              deductionsCents: payslip.grossCents - payslip.netCents,
              memo: gross && isHiddenFrom(gross, viewer) ? null : payslip.memo,
              transferId: payslip.transferId,
              createdByUserId: payslip.createdByUserId,
              createdAt: isoTimestamp(payslip.createdAt),
            }
          }
        )
    ),

    table(
      'payslipLines',
      'payslip_lines.csv',
      ['payslipId', 'transactionId', 'kind', 'categoryId', 'amountCents', 'memo', 'isMasked'],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            Transaction.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .whereNotNull('payslip_id')
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (line) => {
            const masked = isHiddenFrom(line, viewer)
            return {
              payslipId: line.payslipId,
              transactionId: line.id,
              kind: line.kind,
              categoryId: masked ? null : line.categoryId,
              amountCents: line.amountCents,
              memo: masked ? null : line.description,
              isMasked: masked,
            }
          }
        )
    ),

    table(
      'merchantRules',
      'merchant_rules.csv',
      [
        'id',
        'matchType',
        'pattern',
        'categoryId',
        'payeeOverride',
        'paidByUserId',
        'transferAccountId',
        'priority',
        'origin',
        'hitCount',
        'lastHitAt',
        'createdByUserId',
        'createdAt',
      ],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            MerchantRule.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (rule) => ({
            id: rule.id,
            matchType: rule.matchType,
            pattern: rule.pattern,
            categoryId: rule.categoryId,
            payeeOverride: rule.payeeOverride,
            paidByUserId: rule.paidByUserId,
            transferAccountId: rule.transferAccountId,
            priority: rule.priority,
            origin: rule.origin,
            hitCount: rule.hitCount,
            lastHitAt: isoTimestamp(rule.lastHitAt),
            createdByUserId: rule.createdByUserId,
            createdAt: isoTimestamp(rule.createdAt),
          })
        )
    ),

    table(
      'importBatches',
      'import_batches.csv',
      [
        'id',
        'accountId',
        'status',
        'source',
        'fileName',
        'archived',
        'dateFrom',
        'dateTo',
        'rowCount',
        'newCount',
        'matchedCount',
        'confirmationCount',
        'duplicateCount',
        'transferCount',
        'ignoredCount',
        'supersededCount',
        'openingBalanceCents',
        'expectedBalanceCents',
        'computedBalanceCents',
        'uploadedByUserId',
        'createdAt',
        'completedAt',
      ],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            ImportBatch.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (batch) => ({
            id: batch.id,
            accountId: batch.accountId,
            status: batch.status,
            source: batch.source,
            fileName: batch.fileName,
            // Whether the bank file is kept in storage; never its key.
            archived: batch.filePath !== null,
            dateFrom: batch.dateFrom,
            dateTo: batch.dateTo,
            rowCount: batch.rowCount,
            newCount: batch.newCount,
            matchedCount: batch.matchedCount,
            confirmationCount: batch.confirmationCount,
            duplicateCount: batch.duplicateCount,
            transferCount: batch.transferCount,
            ignoredCount: batch.ignoredCount,
            supersededCount: batch.supersededCount,
            openingBalanceCents: batch.openingBalanceCents,
            expectedBalanceCents: batch.expectedBalanceCents,
            computedBalanceCents: batch.computedBalanceCents,
            uploadedByUserId: batch.uploadedByUserId,
            createdAt: isoTimestamp(batch.createdAt),
            completedAt: isoTimestamp(batch.completedAt),
          })
        )
    ),

    table(
      'importRows',
      'import_rows.csv',
      [
        'id',
        'importBatchId',
        'accountId',
        'rowIndex',
        'bankDate',
        'date',
        'amountCents',
        'isPending',
        'resolution',
        'proposedResolution',
        'decision',
        'transactionId',
        'matchTransactionId',
        'transferLegTransactionId',
        'decidedByUserId',
        'decidedAt',
        'confirmedAt',
      ],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            ImportRow.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .preload('transaction', (query) => query.select(PRIVACY_COLUMNS))
              .preload('matchTransaction', (query) => query.select(PRIVACY_COLUMNS))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (row) => {
            // Linked to the partner's private transaction: its decision would reveal it.
            const linked = row.transaction ?? row.matchTransaction ?? null
            const masked = linked !== null && isHiddenFrom(linked, viewer)
            return {
              id: row.id,
              importBatchId: row.importBatchId,
              accountId: row.accountId,
              rowIndex: row.rowIndex,
              bankDate: row.bankDate,
              date: row.date,
              amountCents: row.amountCents,
              isPending: row.isPending,
              resolution: row.resolution,
              proposedResolution: row.proposedResolution,
              decision: masked ? null : (row.decision as Record<string, unknown> | null),
              transactionId: row.transactionId,
              matchTransactionId: row.matchTransactionId,
              transferLegTransactionId: row.transferLegTransactionId,
              decidedByUserId: row.decidedByUserId,
              decidedAt: isoTimestamp(row.decidedAt),
              confirmedAt: isoTimestamp(row.confirmedAt),
            }
          }
        )
    ),

    table(
      'savingsGoals',
      'savings_goals.csv',
      [
        'id',
        'name',
        'targetCents',
        'targetDate',
        'startingCents',
        'monthlyContributionCents',
        'accountId',
        'userId',
        'status',
        'reachedAt',
        'sortOrder',
        'createdByUserId',
        'createdAt',
      ],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            SavingsGoal.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (goal) => ({
            id: goal.id,
            name: goal.name,
            targetCents: goal.targetCents,
            targetDate: goal.targetDate,
            startingCents: goal.startingCents,
            monthlyContributionCents: goal.monthlyContributionCents,
            accountId: goal.accountId,
            userId: goal.userId,
            status: goal.status,
            reachedAt: isoTimestamp(goal.reachedAt),
            sortOrder: goal.sortOrder,
            createdByUserId: goal.createdByUserId,
            createdAt: isoTimestamp(goal.createdAt),
          })
        )
    ),

    table(
      'recurringItems',
      'recurring_items.csv',
      [
        'id',
        'merchantKey',
        'payee',
        'categoryId',
        'accountId',
        'paidByUserId',
        'cadence',
        'amountCents',
        'amountTolerancePct',
        'lastPaidDate',
        'nextExpectedDate',
        'status',
        'source',
        'occurrences',
        'editedFields',
        'createdAt',
      ],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            RecurringItem.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          // Detection never reads private purchases, so items carry nothing to mask.
          (item) => ({
            id: item.id,
            merchantKey: item.merchantKey,
            payee: item.payee,
            categoryId: item.categoryId,
            accountId: item.accountId,
            paidByUserId: item.paidByUserId,
            cadence: item.cadence,
            amountCents: item.amountCents,
            amountTolerancePct: item.amountTolerancePct,
            lastPaidDate: item.lastPaidDate,
            nextExpectedDate: item.nextExpectedDate,
            status: item.status,
            source: item.source,
            occurrences: item.occurrences,
            editedFields: item.editedFields,
            createdAt: isoTimestamp(item.createdAt),
          })
        )
    ),

    table(
      'monthlyInsights',
      'monthly_insights.csv',
      [
        'id',
        'month',
        'locale',
        'headline',
        'highlights',
        'bodyMarkdown',
        'model',
        'generatedByUserId',
        'generatedAt',
      ],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            MonthlyInsight.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (insight) => ({
            id: insight.id,
            month: insight.month,
            locale: insight.locale,
            headline: insight.headline,
            highlights: insight.highlights.map((highlight) => ({ ...highlight })),
            bodyMarkdown: insight.bodyMarkdown,
            model: insight.model,
            generatedByUserId: insight.generatedByUserId,
            generatedAt: isoTimestamp(insight.generatedAt),
          })
        )
    ),

    table(
      'llmUsage',
      'llm_usage.csv',
      ['month', 'purpose', 'calls', 'failedCalls', 'inputTokens', 'outputTokens', 'costMicros'],
      () => llmUsageByMonth(household)
    ),

    table(
      'ownershipTransfers',
      'ownership_transfers.csv',
      ['id', 'fromUserId', 'toUserId', 'createdAt'],
      () =>
        keyset(
          pageSize,
          (afterId, limit) =>
            HouseholdOwnershipTransfer.query()
              .withScopes((scopes) => scopes.forHousehold(household))
              .where('id', '>', afterId)
              .orderBy('id')
              .limit(limit),
          (transfer) => ({
            id: transfer.id,
            fromUserId: transfer.fromUserId,
            toUserId: transfer.toUserId,
            createdAt: isoTimestamp(transfer.createdAt),
          })
        )
    ),
  ]
}

/**
 * LLM usage as totals per month (in the household's time zone) and
 * purpose: the per-call rows stay internal (error messages, latency). One
 * aggregate query; its size is months x purposes, so it needs no paging.
 */
/** One aggregate row of `llmUsageByMonth`, as Postgres names its columns. */
interface UsageTotals {
  month: string
  purpose: string
  calls: number | string
  failed_calls: number | string
  input_tokens: number | string
  output_tokens: number | string
  cost_micros: number | string
}

async function* llmUsageByMonth(household: Household) {
  const rows: UsageTotals[] = await db
    .from('llm_usage')
    .where('household_id', household.id)
    .select(db.raw(`to_char(created_at AT TIME ZONE ?, 'YYYY-MM') AS month`, [household.timezone]))
    .select('purpose')
    .count('* as calls')
    .select(db.raw(`count(*) FILTER (WHERE status <> 'ok') AS failed_calls`))
    .select(db.raw('sum(input_tokens)::bigint AS input_tokens'))
    .select(db.raw('sum(output_tokens)::bigint AS output_tokens'))
    .select(db.raw('sum(cost_micros)::bigint AS cost_micros'))
    .groupByRaw('1, 2')
    .orderByRaw('1, 2')

  for (const row of rows) {
    yield {
      month: String(row.month),
      purpose: String(row.purpose),
      calls: Number(row.calls),
      failedCalls: Number(row.failed_calls),
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      costMicros: Number(row.cost_micros),
    }
  }
}
