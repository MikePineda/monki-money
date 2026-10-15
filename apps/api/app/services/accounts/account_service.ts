import type User from '#models/user'
import Account from '#models/account'
import { inject } from '@adonisjs/core'
import AccountCard from '#models/account_card'
import type Household from '#models/household'
import { entitlementsFor } from '#config/plans'
import { AccountInUse, AccountLimitReached } from '#exceptions/errors'
import { FieldError } from '#exceptions/field_error'
import { findInHousehold } from '#repositories/scoped'
import AccountUsage from '#services/accounts/account_usage'
import { nextSortOrder, reorder } from '#services/sort_order'
import AccountBalances from '#services/accounts/account_balances'
import { assertMemberOf } from '#services/households/membership_lookup'
import type { AddCardInput, CreateAccountInput, UpdateAccountInput } from '#services/accounts/dto'

/**
 * Accounts of the current household. Every lookup is household-scoped
 * (another household's id = 404) and every user id in the input must be a
 * member (422).
 */
@inject()
export default class AccountService {
  constructor(
    protected usage: AccountUsage,
    protected balances: AccountBalances
  ) {}

  async list(household: Household) {
    const accounts = await Account.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .preload('cards', (cards) => cards.orderBy('id'))
      .orderBy('sort_order')
      .orderBy('id')
    return { accounts, balances: await this.balances.forAccounts(accounts) }
  }

  async find(household: Household, accountId: number) {
    const account = await findInHousehold(Account, household, accountId)
    await account.load('cards', (cards) => cards.orderBy('id'))
    return { account, balances: await this.balances.forAccounts([account]) }
  }

  async create(household: Household, creator: User, input: CreateAccountInput) {
    await this.assertValid(household, input)
    await this.assertRoomForAnotherAccount(household)

    const account = await Account.create({
      householdId: household.id,
      name: input.name,
      kind: input.kind,
      institution: input.institution ?? null,
      ownerUserId: input.ownerUserId ?? null,
      currencyCode: input.currencyCode ?? household.currencyCode,
      externalAccountNumber: input.externalAccountNumber ?? null,
      openingBalanceCents: input.openingBalanceCents ?? 0,
      openingBalanceDate: input.openingBalanceDate ?? null,
      isActive: input.isActive ?? true,
      sortOrder: await nextSortOrder('accounts', { household_id: household.id }),
      createdByUserId: creator.id,
    })
    return this.find(household, account.id)
  }

  async update(household: Household, accountId: number, input: UpdateAccountInput) {
    const account = await findInHousehold(Account, household, accountId)
    await this.assertValid(household, input, account.id)

    account.merge(
      Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
    )
    await account.save()
    return this.find(household, account.id)
  }

  async delete(household: Household, accountId: number) {
    const account = await findInHousehold(Account, household, accountId)
    if ((await this.usage.transactionCount(account)) > 0) throw new AccountInUse()
    await account.delete()
  }

  async reorder(household: Household, ids: number[]) {
    await reorder(Account, household, ids)
  }

  async addCard(household: Household, accountId: number, input: AddCardInput) {
    const account = await findInHousehold(Account, household, accountId)
    if (input.userId) await assertMemberOf(household, input.userId, 'userId')

    const taken = await AccountCard.query()
      .where('account_id', account.id)
      .where('card_suffix', input.cardSuffix)
      .first()
    if (taken) throw new FieldError('cardSuffix', 'taken')

    return AccountCard.create({
      accountId: account.id,
      cardSuffix: input.cardSuffix,
      userId: input.userId ?? null,
      label: input.label ?? null,
    })
  }

  async removeCard(household: Household, accountId: number, cardId: number) {
    const account = await findInHousehold(Account, household, accountId)
    const card = await AccountCard.query()
      .where('account_id', account.id)
      .where('id', cardId)
      .firstOrFail()
    await card.delete()
  }

  /** Plan limit (`config/plans.ts`): 402 when the household has no room left. */
  protected async assertRoomForAnotherAccount(household: Household) {
    const accounts = await Account.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .count('* as total')
      .firstOrFail()
    if (Number(accounts.$extras['total']) >= entitlementsFor(household.plan).maxAccounts) {
      throw new AccountLimitReached()
    }
  }

  protected async assertValid(household: Household, input: UpdateAccountInput, accountId?: number) {
    if (input.ownerUserId) await assertMemberOf(household, input.ownerUserId, 'ownerUserId')

    if (input.externalAccountNumber) {
      const query = Account.query()
        .withScopes((scopes) => scopes.forHousehold(household))
        .where('external_account_number', input.externalAccountNumber)
      if (accountId) query.whereNot('id', accountId)
      if (await query.first()) throw new FieldError('externalAccountNumber', 'taken')
    }
  }
}
