import db from '@adonisjs/lucid/services/db'
import type { Posting } from '#domain/ledger/posting'
import type {
  AccountKind,
  CategoryGroupKind,
  TransactionKind,
  TransactionStatus,
} from '@monkimoney/shared'
import { householdIdOf, type HouseholdRef } from '#models/mixins/household_scoped'

type PostingRow = {
  transaction_id: number
  split_id: number | null
  transfer_id: number | null
  account_id: number
  account_kind: AccountKind
  date: string
  amount_cents: number
  kind: TransactionKind
  status: TransactionStatus
  category_id: number | null
  group_id: number | null
  group_kind: CategoryGroupKind | null
  paid_by_user_id: number | null
  created_by_user_id: number | null
  is_private: boolean
  tags: string[]
}

/**
 * The ONLY place that flattens the ledger into postings: a transaction
 * that is not split is one posting; a split transaction is one posting per
 * line, with the line's amount and category
 * (`COALESCE(split.category_id, tx.category_id)`) and the parent's
 * everything else (tags included). Every report is a pure function over
 * these rows (app/domain/reports), so the SQL stays this one join.
 */
export default class PostingsRepository {
  /** Postings of the household dated `from`..`to` (inclusive calendar dates). */
  async between(
    household: HouseholdRef,
    from: string,
    to: string,
    options: { accountIds?: number[] } = {}
  ): Promise<Posting[]> {
    const conditions = ['t.date BETWEEN ? AND ?']
    const bindings: unknown[] = [from, to]
    if (options.accountIds?.length) {
      conditions.push('t.account_id = ANY(?::int[])')
      bindings.push(options.accountIds)
    }
    return this.select(household, conditions, bindings)
  }

  /**
   * Postings of every tagged transaction of the household, or only of those
   * carrying `tag` (jsonb containment, GIN index), dated `from`..`to` when
   * given (inclusive, either end open). The reader's privacy mask is applied
   * by the caller.
   */
  async tagged(
    household: HouseholdRef,
    options: { tag?: string; from?: string; to?: string } = {}
  ): Promise<Posting[]> {
    const conditions: string[] = []
    const bindings: unknown[] = []
    if (options.tag === undefined) {
      conditions.push("t.tags <> '[]'::jsonb")
    } else {
      conditions.push('t.tags @> ?::jsonb')
      bindings.push(JSON.stringify([options.tag]))
    }
    if (options.from !== undefined) {
      conditions.push('t.date >= ?')
      bindings.push(options.from)
    }
    if (options.to !== undefined) {
      conditions.push('t.date <= ?')
      bindings.push(options.to)
    }
    return this.select(household, conditions, bindings)
  }

  protected async select(
    household: HouseholdRef,
    conditions: string[],
    bindings: unknown[]
  ): Promise<Posting[]> {
    const result = await db.rawQuery<{ rows: PostingRow[] }>(
      `SELECT t.id AS transaction_id,
              s.id AS split_id,
              t.transfer_id,
              t.account_id,
              a.kind AS account_kind,
              t.date,
              COALESCE(s.amount_cents, t.amount_cents) AS amount_cents,
              t.kind,
              t.status,
              c.id AS category_id,
              c.category_group_id AS group_id,
              g.kind AS group_kind,
              t.paid_by_user_id,
              t.created_by_user_id,
              t.is_private,
              t.tags
         FROM transactions t
         JOIN accounts a
           ON a.id = t.account_id AND a.household_id = t.household_id
         LEFT JOIN transaction_splits s
           ON s.transaction_id = t.id AND s.household_id = t.household_id
         LEFT JOIN categories c
           ON c.id = COALESCE(s.category_id, t.category_id) AND c.household_id = t.household_id
         LEFT JOIN category_groups g
           ON g.id = c.category_group_id
        WHERE t.household_id = ?
          ${conditions.map((condition) => `AND ${condition}`).join('\n          ')}
        ORDER BY t.date, t.id, s.sort_order, s.id`,
      [householdIdOf(household), ...bindings] as any[]
    )

    return result.rows.map((row) => ({
      transactionId: row.transaction_id,
      splitId: row.split_id,
      transferId: row.transfer_id,
      accountId: row.account_id,
      accountKind: row.account_kind,
      date: row.date,
      amountCents: row.amount_cents,
      kind: row.kind,
      status: row.status,
      categoryId: row.category_id,
      groupId: row.group_id,
      groupKind: row.group_kind,
      paidByUserId: row.paid_by_user_id,
      createdByUserId: row.created_by_user_id,
      isPrivate: row.is_private,
      tags: row.tags ?? [],
      hidden: false,
    }))
  }
}
