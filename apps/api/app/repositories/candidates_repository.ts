import Transaction from '#models/transaction'
import type { TransactionKind, TransactionSource, TransactionStatus } from '@monkimoney/shared'
import type { HouseholdRef } from '#models/mixins/household_scoped'

/** What the import matcher may compare an incoming bank row against. */
export type CandidateQuery = {
  accountId: number
  /** Signed, exactly as the bank row. */
  amountCents: number
  /** Inclusive calendar-date window, e.g. [row.date - 3, bankDate + 1]. */
  from: string
  to: string
  /** Restrict to these sources (e.g. manual + receipt, or pending imports). */
  sources?: TransactionSource[]
  statuses?: TransactionStatus[]
  /** Rows already claimed earlier in the same import. */
  excludeIds?: number[]
}

/** A ledger row as the matcher sees it (plain values only). */
export type MatchCandidate = {
  id: number
  accountId: number
  date: string
  bankDate: string | null
  amountCents: number
  payee: string | null
  description: string | null
  rawDescription: string | null
  source: TransactionSource
  status: TransactionStatus
  cardSuffix: string | null
  paidByUserId: number | null
  transferId: number | null
  kind: TransactionKind
}

/**
 * Candidate transactions for the import matcher (package 3.3): same
 * account, same signed amount, date inside the window. Served by the
 * `(household_id, account_id, amount_cents, date)` index. The matcher (pure,
 * app/domain/importing) scores them; this only fetches.
 */
export default class CandidatesRepository {
  async find(household: HouseholdRef, query: CandidateQuery): Promise<MatchCandidate[]> {
    const rows = await Transaction.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('account_id', query.accountId)
      .where('amount_cents', query.amountCents)
      .whereBetween('date', [query.from, query.to])
      .if(query.sources?.length, (builder) => builder.whereIn('source', query.sources!))
      .if(query.statuses?.length, (builder) => builder.whereIn('status', query.statuses!))
      .if(query.excludeIds?.length, (builder) => builder.whereNotIn('id', query.excludeIds!))
      .orderBy('date')
      .orderBy('id')

    return rows.map((row) => this.toCandidate(row))
  }

  /**
   * Everything one account's bank export may be the copy of, in a date
   * window: ledger rows of the account that no import row of this account
   * is linked to yet (typed by hand, scanned, or the other leg of a transfer
   * created while importing another account), plus imports still pending
   * at the bank. Any amount: the matcher filters. Rows created from this
   * account's export and already cleared are never offered (the hash
   * catches re-imports instead).
   */
  async forImport(
    household: HouseholdRef,
    query: { accountId: number; from: string; to: string }
  ): Promise<MatchCandidate[]> {
    const rows = await Transaction.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('account_id', query.accountId)
      .whereBetween('date', [query.from, query.to])
      .where((builder) => {
        builder
          .where((pending) => pending.where('source', 'import').where('status', 'pending'))
          .orWhereNotExists((linked) => {
            linked
              .from('import_rows')
              .whereColumn('import_rows.transaction_id', 'transactions.id')
              .whereColumn('import_rows.account_id', 'transactions.account_id')
          })
      })
      .orderBy('date')
      .orderBy('id')

    return rows.map((row) => this.toCandidate(row))
  }

  protected toCandidate(row: Transaction): MatchCandidate {
    return {
      id: row.id,
      accountId: row.accountId,
      date: row.date,
      bankDate: row.bankDate,
      amountCents: row.amountCents,
      payee: row.payee,
      description: row.description,
      rawDescription: row.rawDescription,
      source: row.source,
      status: row.status,
      cardSuffix: row.cardSuffix,
      paidByUserId: row.paidByUserId,
      transferId: row.transferId,
      kind: row.kind,
    }
  }
}
