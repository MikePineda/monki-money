import type User from '#models/user'
import Clock from '#services/clock'
import Account from '#models/account'
import { inject } from '@adonisjs/core'
import type Household from '#models/household'
import Transaction from '#models/transaction'
import { todayIn } from '#domain/calendar/month'
import { isHiddenFrom } from '#domain/ledger/privacy'
import { SUGGESTION_ROWS } from '@monkimoney/shared'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import { lastAccountUsed } from '#services/ledger/last_account'
import { suggestionsFrom, type SuggestionRow } from '#domain/ledger/suggestions'

const COLUMNS = [
  'id',
  'kind',
  'date',
  'account_id',
  'amount_cents',
  'category_id',
  'payee',
  'transfer_id',
  'paid_by_user_id',
  'created_by_user_id',
  'is_private',
] as const

/**
 * Quick add's suggestions for one person (`GET /transactions/suggestions`):
 * ranked over their own latest {@link SUGGESTION_ROWS} rows (entered or
 * paid by them) plus the household's latest {@link SUGGESTION_ROWS}, so a
 * partner's busy week never pushes their own habits out of the window. The
 * partner's private rows count for nothing (app/domain/ledger/privacy.ts).
 */
@inject()
export default class TransactionSuggestions {
  constructor(protected clock: Clock) {}

  async for(household: Household, viewer: User) {
    const reader = await privacyViewer(household, viewer)
    const [household100, own100, active, lastAccountId] = await Promise.all([
      this.latest(household),
      this.latest(household).where((rows) =>
        rows.where('created_by_user_id', viewer.id).orWhere('paid_by_user_id', viewer.id)
      ),
      Account.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .where('is_active', true)
        .select('id'),
      lastAccountUsed(household, viewer),
    ])

    const rows = new Map<number, SuggestionRow>()
    for (const row of [...own100, ...household100]) {
      rows.set(row.id, {
        id: row.id,
        kind: row.kind,
        date: row.date,
        accountId: row.accountId,
        amountCents: row.amountCents,
        categoryId: row.categoryId,
        payee: row.payee,
        transferId: row.transferId,
        hidden: isHiddenFrom(row, reader),
      })
    }

    return suggestionsFrom([...rows.values()], {
      today: todayIn(this.clock.now(), household.timezone),
      activeAccountIds: new Set(active.map((account) => account.id)),
      lastAccountId,
    })
  }

  /** The household's newest rows first, as the ledger list orders them. */
  protected latest(household: Household) {
    return Transaction.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .select(...COLUMNS)
      .orderBy('date', 'desc')
      .orderBy('id', 'desc')
      .limit(SUGGESTION_ROWS)
  }
}
