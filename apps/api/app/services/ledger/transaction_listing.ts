import Transaction from '#models/transaction'
import type Household from '#models/household'
import { monthRange } from '#domain/calendar/month'
import type { TransactionFilters } from '#services/ledger/dto'
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
 * is hidden from the reader (text search, category, "uncategorized"), so
 * a search cannot reveal what the payee or category was.
 */
export default class TransactionListing {
  async paginate(household: Household, viewerUserId: number, filters: TransactionFilters) {
    const query = Transaction.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .preload('splits', (splits) => splits.orderBy('sort_order').orderBy('id'))

    this.dateRange(query, filters)

    if (filters.accountId?.length) query.whereIn('account_id', filters.accountId)
    if (filters.paidByUserId !== undefined) query.where('paid_by_user_id', filters.paidByUserId)
    if (filters.kind) query.where('kind', filters.kind)
    if (filters.status) query.where('status', filters.status)
    if (filters.needsReview !== undefined) query.where('needs_review', filters.needsReview)

    if (filters.categoryId?.length) {
      const ids = filters.categoryId
      this.visibleDetails(query, viewerUserId)
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
      this.visibleDetails(query, viewerUserId)
      query.whereNull('category_id').where('is_split', false).whereNot('kind', 'transfer')
    }

    if (filters.q) {
      const pattern = containing(filters.q)
      this.visibleDetails(query, viewerUserId)
      query.where((builder) => {
        builder
          .whereILike('payee', pattern)
          .orWhereILike('description', pattern)
          .orWhereILike('raw_description', pattern)
      })
    }

    this.sort(query, filters.sort ?? '-date')

    return query.paginate(filters.page ?? 1, filters.perPage ?? DEFAULT_PER_PAGE)
  }

  protected dateRange(query: TransactionQuery, filters: TransactionFilters) {
    const range = filters.month ? monthRange(filters.month) : { from: filters.from, to: filters.to }
    if (range.from) query.where('date', '>=', range.from)
    if (range.to) query.where('date', '<=', range.to)
  }

  /** Rows whose details the reader may see (see app/domain/ledger/privacy.ts). */
  protected visibleDetails(query: TransactionQuery, viewerUserId: number) {
    query.where((builder) => {
      builder
        .where('is_private', false)
        .orWhere('paid_by_user_id', viewerUserId)
        .orWhere((joint) =>
          joint.whereNull('paid_by_user_id').where('created_by_user_id', viewerUserId)
        )
    })
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
