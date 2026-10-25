import Transaction from '#models/transaction'
import type Household from '#models/household'
import { monthRange } from '#domain/calendar/month'
import type { TransactionFilters } from '#services/ledger/dto'
import type { PrivacyViewer } from '#domain/ledger/privacy'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

const DEFAULT_PER_PAGE = 50

type TransactionQuery = ModelQueryBuilderContract<typeof Transaction>

/** `%term%` with LIKE wildcards in the term taken literally. */
function containing(term: string) {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

/**
 * Filtering, sorting and pagination of `GET /transactions`.
 *
 * Privacy: a private transaction of the partner still appears (masked by
 * the transformer, its amount counts) but never matches a filter on what
 * is hidden from the reader (text search, category, "uncategorized",
 * review state, tag), so a search cannot reveal what the payee, category
 * or tags were. Nor does the memo of a payslip whose gross line is private
 * to the partner, copied onto its transfer's legs.
 */
export default class TransactionListing {
  async paginate(household: Household, viewer: PrivacyViewer, filters: TransactionFilters) {
    const query = Transaction.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .preload('splits', (splits) => splits.orderBy('sort_order').orderBy('id'))

    this.dateRange(query, filters)

    if (filters.accountId?.length) query.whereIn('account_id', filters.accountId)
    if (filters.paidByUserId !== undefined) query.where('paid_by_user_id', filters.paidByUserId)
    if (filters.paidBy === 'joint') query.whereNull('paid_by_user_id')
    if (filters.kind) query.where('kind', filters.kind)
    if (filters.status) query.where('status', filters.status)
    if (filters.source) query.where('source', filters.source)
    if (filters.needsReview !== undefined) {
      this.visibleDetails(query, viewer)
      query.where('needs_review', filters.needsReview)
    }

    if (filters.categoryId?.length) {
      const ids = filters.categoryId
      this.visibleDetails(query, viewer)
      query.where((builder) => {
        builder.whereIn('transactions.category_id', ids).orWhereExists((splits) => {
          splits
            .from('transaction_splits')
            .whereColumn('transaction_splits.transaction_id', 'transactions.id')
            .whereIn('transaction_splits.category_id', ids)
        })
      })
    }

    if (filters.uncategorized) {
      this.visibleDetails(query, viewer)
      query.whereNull('category_id').where('is_split', false).whereNot('kind', 'transfer')
    }

    if (filters.q) {
      const pattern = containing(filters.q)
      this.visibleDetails(query, viewer)
      query.where((builder) => {
        builder
          .whereILike('payee', pattern)
          .orWhere((notes) => {
            notes.whereILike('description', pattern)
            this.notAHiddenPayslipMemo(notes, viewer)
          })
          .orWhereILike('raw_description', pattern)
      })
    }

    if (filters.tag !== undefined) {
      this.visibleDetails(query, viewer)
      query.whereRaw('transactions.tags @> ?::jsonb', [JSON.stringify([filters.tag])])
    }

    this.sort(query, filters.sort ?? '-date')

    return query.paginate(filters.page ?? 1, filters.perPage ?? DEFAULT_PER_PAGE)
  }

  protected dateRange(query: TransactionQuery, filters: TransactionFilters) {
    const range = filters.month ? monthRange(filters.month) : { from: filters.from, to: filters.to }
    if (range.from) query.where('date', '>=', range.from)
    if (range.to) query.where('date', '<=', range.to)
  }

  /**
   * Rows whose details the reader may see: the SQL twin of `isHiddenFrom`
   * (app/domain/ledger/privacy.ts). A private row is hidden when its owner
   * (payer, else creator) is another current member.
   */
  protected visibleDetails(query: TransactionQuery, viewer: PrivacyViewer) {
    const owner = 'COALESCE(transactions.paid_by_user_id, transactions.created_by_user_id)'
    query.whereRaw(
      `NOT (transactions.is_private
            AND ${owner} IS NOT NULL
            AND ${owner} <> ?
            AND ${owner} = ANY(?::int[]))`,
      [viewer.userId, [...viewer.memberIds]]
    )
  }

  /**
   * The row's note is not the memo of a payslip whose gross line is hidden
   * from the reader, copied onto the row's transfer: the SQL twin of
   * `hiddenPayslipMemosOn` (app/services/ledger/privacy_viewer.ts), so a
   * search never finds the transfer of a private payslip by its memo.
   */
  protected notAHiddenPayslipMemo(query: TransactionQuery, viewer: PrivacyViewer) {
    const owner = 'COALESCE(gross.paid_by_user_id, gross.created_by_user_id)'
    query.whereRaw(
      `NOT EXISTS (
         SELECT 1 FROM payslips
         JOIN transactions AS gross
           ON gross.payslip_id = payslips.id AND gross.kind = 'income'
         WHERE payslips.household_id = transactions.household_id
           AND payslips.transfer_id = transactions.transfer_id
           AND payslips.memo = transactions.description
           AND gross.is_private
           AND ${owner} IS NOT NULL
           AND ${owner} <> ?
           AND ${owner} = ANY(?::int[]))`,
      [viewer.userId, [...viewer.memberIds]]
    )
  }

  protected sort(query: TransactionQuery, sort: NonNullable<TransactionFilters['sort']>) {
    const direction = sort.startsWith('-') ? 'desc' : 'asc'
    if (sort.endsWith('amount')) {
      query.orderBy('amount_cents', direction).orderBy('date', 'desc').orderBy('id', 'desc')
    } else {
      query.orderBy('date', direction).orderBy('id', direction)
    }
  }
}
