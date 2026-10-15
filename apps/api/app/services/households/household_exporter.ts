import { DateTime } from 'luxon'
import Account from '#models/account'
import Category from '#models/category'
import type Household from '#models/household'
import CategoryGroup from '#models/category_group'
import HouseholdMember from '#models/household_member'
import { isoTimestamp } from '#domain/time/iso_timestamp'

const PAGE_SIZE = 500

/**
 * Full JSON export of a household ("download my data"), streamed as it is
 * read so memory stays flat as tables grow. Sections are read page by page
 * in id order. Never includes secrets (password hashes, tokens). The ledger
 * sections join this export when their tables exist.
 */
export default class HouseholdExporter {
  async *json(household: Household): AsyncGenerator<string> {
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

    yield '}\n'
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
