import { DateTime } from 'luxon'
import Account from '#models/account'
import Category from '#models/category'
import Transfer from '#models/transfer'
import type Household from '#models/household'
import Transaction from '#models/transaction'
import CategoryGroup from '#models/category_group'
import HouseholdMember from '#models/household_member'
import { isHiddenFrom } from '#domain/ledger/privacy'
import { isoTimestamp } from '#domain/time/iso_timestamp'

const PAGE_SIZE = 500

/**
 * Full JSON export of a household ("download my data"), streamed as it is
 * read so memory stays flat as tables grow. Sections are read page by page
 * in id order. Never includes secrets (password hashes, tokens). The
 * partner's private transactions keep their amount but not their details
 * (same rule as the API, app/domain/ledger/privacy.ts).
 */
export default class HouseholdExporter {
  async *json(household: Household, viewerUserId: number): AsyncGenerator<string> {
    yield `{"format":"monkimoney-export","version":1,"exportedAt":${JSON.stringify(
      isoTimestamp(DateTime.now())
    )}`
    yield `,"household":${JSON.stringify({
      id: household.id,
      name: household.name,
      plan: household.plan,
      status: household.status,
      currencyCode: household.currencyCode,
      locale: household.locale,
      timezone: household.timezone,
      settings: household.settings,
      createdAt: isoTimestamp(household.createdAt),
    })}`

    yield* this.section('members', (page) =>
      HouseholdMember.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .preload('user')
        .orderBy('id')
        .forPage(page, PAGE_SIZE)
        .then((rows) =>
          rows.map((member) => ({
            userId: member.userId,
            fullName: member.user.fullName,
            email: member.user.email,
            role: member.role,
            displayName: member.displayName,
            joinedAt: isoTimestamp(member.joinedAt),
          }))
        )
    )

    yield* this.section('accounts', (page) =>
      Account.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .preload('cards')
        .orderBy('id')
        .forPage(page, PAGE_SIZE)
        .then((rows) =>
          rows.map((account) => ({
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
            cards: account.cards.map((card) => ({
              cardSuffix: card.cardSuffix,
              userId: card.userId,
              label: card.label,
            })),
          }))
        )
    )

    yield* this.section('categoryGroups', (page) =>
      CategoryGroup.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .orderBy('id')
        .forPage(page, PAGE_SIZE)
        .then((rows) =>
          rows.map((group) => ({
            id: group.id,
            slug: group.slug,
            name: group.name,
            kind: group.kind,
            isHidden: group.isHidden,
            isSystem: group.isSystem,
          }))
        )
    )

    yield* this.section('categories', (page) =>
      Category.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .orderBy('id')
        .forPage(page, PAGE_SIZE)
        .then((rows) =>
          rows.map((category) => ({
            id: category.id,
            categoryGroupId: category.categoryGroupId,
            slug: category.slug,
            name: category.name,
            icon: category.icon,
            isHidden: category.isHidden,
            isSystem: category.isSystem,
          }))
        )
    )

    yield* this.section('transfers', (page) =>
      Transfer.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .orderBy('id')
        .forPage(page, PAGE_SIZE)
        .then((rows) =>
          rows.map((transfer) => ({
            id: transfer.id,
            date: transfer.date,
            amountCents: transfer.amountCents,
            fromAccountId: transfer.fromAccountId,
            toAccountId: transfer.toAccountId,
            memo: transfer.memo,
            createdByUserId: transfer.createdByUserId,
            createdAt: isoTimestamp(transfer.createdAt),
          }))
        )
    )

    yield* this.section('transactions', (page) =>
      Transaction.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .preload('splits', (splits) => splits.orderBy('sort_order').orderBy('id'))
        .orderBy('id')
        .forPage(page, PAGE_SIZE)
        .then((rows) => rows.map((transaction) => this.transaction(transaction, viewerUserId)))
    )

    yield '}\n'
  }

  protected transaction(transaction: Transaction, viewerUserId: number) {
    const masked = isHiddenFrom(transaction, viewerUserId)
    return {
      id: transaction.id,
      accountId: transaction.accountId,
      kind: transaction.kind,
      date: transaction.date,
      bankDate: transaction.bankDate,
      amountCents: transaction.amountCents,
      currencyCode: transaction.currencyCode,
      payee: masked ? null : transaction.payee,
      description: masked ? null : transaction.description,
      rawDescription: masked ? null : transaction.rawDescription,
      categoryId: masked ? null : transaction.categoryId,
      isSplit: masked ? false : transaction.isSplit,
      splits: masked
        ? []
        : transaction.splits.map((line) => ({
            categoryId: line.categoryId,
            amountCents: line.amountCents,
            memo: line.memo,
          })),
      transferId: transaction.transferId,
      paidByUserId: transaction.paidByUserId,
      status: transaction.status,
      source: transaction.source,
      needsReview: transaction.needsReview,
      cardSuffix: transaction.cardSuffix,
      isPrivate: transaction.isPrivate,
      tags: masked ? [] : transaction.tags,
      createdByUserId: transaction.createdByUserId,
      createdAt: isoTimestamp(transaction.createdAt),
    }
  }

  protected async *section(
    name: string,
    loadPage: (page: number) => Promise<unknown[]>
  ): AsyncGenerator<string> {
    yield `,${JSON.stringify(name)}:[`
    let first = true
    for (let page = 1; ; page++) {
      const rows = await loadPage(page)
      for (const row of rows) {
        yield `${first ? '' : ','}${JSON.stringify(row)}`
        first = false
      }
      if (rows.length < PAGE_SIZE) break
    }
    yield ']'
  }
}
