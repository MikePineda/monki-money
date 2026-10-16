import type { I18n } from '@adonisjs/i18n'
import Account from '#models/account'
import Category from '#models/category'
import type Household from '#models/household'
import Transaction from '#models/transaction'
import CategoryGroup from '#models/category_group'
import HouseholdMember from '#models/household_member'
import { csvRow } from '#domain/export/csv'
import { isHiddenFrom, type PrivacyViewer } from '#domain/ledger/privacy'
import { centsToDecimal } from '#domain/money/cents'
import { hiddenPayslipMemos, unlessPayslipMemo } from '#services/households/export_tables'

const PAGE_SIZE = 500

/** Last row of a page: the next one starts strictly after it. */
type Cursor = { date: string; id: number }

const COLUMNS = [
  'date',
  'bankDate',
  'account',
  'kind',
  'amount',
  'currency',
  'category',
  'group',
  'payee',
  'description',
  'paidBy',
  'status',
  'source',
  'needsReview',
  'isPrivate',
  'tags',
  'memo',
  'transactionId',
  'transferId',
] as const

/**
 * The ledger as a spreadsheet: one row per posting (a split transaction
 * gives one row per line, with the line's amount and category), names in
 * the reader's locale, amounts as plain decimals, every text cell escaped
 * against formula injection (app/domain/export/csv.ts). The partner's
 * private transactions show their amount under "Private" (and a private
 * payslip's memo is left out of its transfer legs). Streamed page by
 * page in `(date, id)` order with a keyset (`(date, id) > last`), so rows
 * saved or deleted while the export runs never shift a page; starts with a
 * UTF-8 BOM so Excel reads accents right.
 */
export default class LedgerCsvExporter {
  constructor(protected pageSize = PAGE_SIZE) {}

  async *csv(household: Household, viewer: PrivacyViewer, i18n?: I18n): AsyncGenerator<string> {
    const t = (key: string, fallback: string) => (i18n ? i18n.t(key, {}, fallback) : fallback)
    const names = await this.names(household, t)
    const payslipMemos = await hiddenPayslipMemos(household, viewer, this.pageSize)

    yield `\uFEFF${csvRow(COLUMNS.map((column) => t(`messages.export.columns.${column}`, column)))}`

    let after: Cursor | null = null
    for (;;) {
      const rows: Transaction[] = await this.page(household, after)

      for (const transaction of rows) {
        const masked = isHiddenFrom(transaction, viewer)
        const lines =
          !masked && transaction.isSplit
            ? transaction.splits.map((line) => ({
                amountCents: line.amountCents,
                categoryId: line.categoryId as number | null,
                memo: line.memo,
              }))
            : [
                {
                  amountCents: transaction.amountCents,
                  categoryId: transaction.categoryId,
                  memo: null,
                },
              ]

        for (const line of lines) {
          const category = masked ? null : names.categories.get(line.categoryId ?? -1)
          yield csvRow([
            transaction.date,
            transaction.bankDate,
            names.accounts.get(transaction.accountId),
            transaction.kind,
            centsToDecimal(line.amountCents),
            transaction.currencyCode,
            masked ? names.private : category?.name,
            masked ? null : category?.group,
            masked ? null : transaction.payee,
            masked
              ? null
              : unlessPayslipMemo(transaction.description, transaction.transferId, payslipMemos),
            transaction.paidByUserId === null
              ? names.joint
              : names.members.get(transaction.paidByUserId),
            transaction.status,
            transaction.source,
            transaction.needsReview,
            transaction.isPrivate,
            masked ? null : transaction.tags.join('; '),
            masked ? null : line.memo,
            transaction.id,
            transaction.transferId,
          ])
        }
      }

      if (rows.length < this.pageSize) break
      const last = rows[rows.length - 1]
      after = { date: last.date, id: last.id }
    }
  }

  /** The next page after `cursor` in (date, id) order. */
  protected page(household: Household, cursor: Cursor | null) {
    const query = Transaction.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .preload('splits', (splits) => splits.orderBy('sort_order').orderBy('id'))
      .orderBy('date')
      .orderBy('id')
      .limit(this.pageSize)
    if (cursor) {
      query.whereRaw('(transactions.date, transactions.id) > (?::date, ?)', [
        cursor.date,
        cursor.id,
      ])
    }
    return query
  }

  protected async names(household: Household, t: (key: string, fallback: string) => string) {
    const [accounts, groups, categories, members] = await Promise.all([
      Account.query().withScopes((scopes) => scopes.forHousehold(household)),
      CategoryGroup.query().withScopes((scopes) => scopes.forHousehold(household)),
      Category.query().withScopes((scopes) => scopes.forHousehold(household)),
      HouseholdMember.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .preload('user'),
    ])

    const groupNames = new Map(
      groups.map((group) => [
        group.id,
        group.isSystem ? t(`categories.group.${group.slug}`, group.name) : group.name,
      ])
    )

    return {
      private: t('messages.export.private', 'Private'),
      joint: t('messages.export.joint', 'Joint'),
      accounts: new Map(accounts.map((account) => [account.id, account.name])),
      members: new Map(members.map((member) => [member.userId, member.user.fullName])),
      categories: new Map(
        categories.map((category) => [
          category.id,
          {
            name: category.isSystem
              ? t(`categories.${category.slug}`, category.name)
              : category.name,
            group: groupNames.get(category.categoryGroupId),
          },
        ])
      ),
    }
  }
}
