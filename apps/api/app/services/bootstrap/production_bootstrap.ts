import { DateTime } from 'luxon'
import User from '#models/user'
import Account from '#models/account'
import { inject } from '@adonisjs/core'
import Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import AccountCard from '#models/account_card'
import HouseholdMember from '#models/household_member'
import type { AccountKind, Locale } from '@monkimoney/shared'
import TaxonomySeeder from '#services/households/taxonomy_seeder'
import HouseholdCreator from '#services/households/household_creator'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { BootstrapInput, BootstrapUserInput } from '#services/bootstrap/dto'

interface AccountSpec {
  name: string
  institution: string | null
  kind: AccountKind
  /** 'owner' = personal account of user 1; null = joint. */
  owner: 'owner' | null
  externalAccountNumber?: string | null
}

/**
 * The MVP's starting accounts: a joint everyday account (one card per
 * person), joint savings, user 1's wallet and joint cash.
 */
const ACCOUNTS: AccountSpec[] = [
  { name: 'NAB Everyday', institution: 'NAB', kind: 'transaction', owner: null },
  { name: 'NAB Savings', institution: 'NAB', kind: 'savings', owner: null },
  { name: 'Hnry', institution: 'Hnry', kind: 'wallet', owner: 'owner' },
  { name: 'Cash', institution: null, kind: 'cash', owner: null },
]

/**
 * First-deploy bootstrap (also the E2E seed): the household, its two
 * verified users and the starting accounts. Idempotent by email (users),
 * by the owner's current household, by account name and by card suffix:
 * re-running never duplicates rows nor resets a password.
 */
@inject()
export default class ProductionBootstrap {
  constructor(
    protected households: HouseholdCreator,
    protected taxonomy: TaxonomySeeder
  ) {}

  async run(input: BootstrapInput) {
    return db.transaction(async (trx) => {
      const owner = await this.ensureUser(input.owner, input.locale, trx)
      const member = input.member ? await this.ensureUser(input.member, input.locale, trx) : null

      const household = await this.ensureHousehold(input, owner, trx)
      if (member) await this.ensureMembership(household, member, trx)

      const accounts: Account[] = []
      for (const [index, spec] of ACCOUNTS.entries()) {
        accounts.push(
          await this.ensureAccount(
            household,
            owner,
            index,
            {
              ...spec,
              externalAccountNumber: spec.kind === 'transaction' ? input.jointAccountNumber : null,
            },
            trx
          )
        )
      }

      const everyday = accounts[0]
      for (const [person, user] of [
        [input.owner, owner],
        [input.member, member],
      ] as const) {
        if (person?.cardSuffix && user) {
          await this.ensureCard(everyday, person.cardSuffix, user, trx)
        }
      }

      return { household, owner, member, accounts }
    })
  }

  protected async ensureUser(
    person: BootstrapUserInput,
    locale: Locale,
    trx: TransactionClientContract
  ) {
    const existing = await User.query({ client: trx }).where('email', person.email).first()
    if (existing) {
      if (!existing.isEmailVerified) {
        existing.useTransaction(trx)
        existing.emailVerifiedAt = DateTime.now()
        await existing.save()
      }
      return existing
    }

    return User.create(
      {
        email: person.email,
        fullName: person.fullName,
        password: person.password,
        locale,
        theme: 'system',
        sessionVersion: 1,
        emailVerifiedAt: DateTime.now(),
      },
      { client: trx }
    )
  }

  protected async ensureHousehold(
    input: BootstrapInput,
    owner: User,
    trx: TransactionClientContract
  ) {
    const current = owner.currentHouseholdId
      ? await Household.find(owner.currentHouseholdId, { client: trx })
      : null

    if (current) {
      await this.taxonomy.seed(current.id, current.locale, trx)
      return current
    }

    const { household } = await this.households.create(
      { owner, name: input.householdName, locale: input.locale },
      trx
    )
    return household
  }

  protected async ensureMembership(
    household: Household,
    user: User,
    trx: TransactionClientContract
  ) {
    const membership = await HouseholdMember.query({ client: trx })
      .where('household_id', household.id)
      .where('user_id', user.id)
      .first()
    if (!membership) {
      await this.households.addMember(household, { user, role: 'member' }, trx)
    }
  }

  protected async ensureAccount(
    household: Household,
    owner: User,
    sortOrder: number,
    spec: AccountSpec,
    trx: TransactionClientContract
  ) {
    const existing = await Account.query({ client: trx })
      .where('household_id', household.id)
      .where('name', spec.name)
      .first()
    if (existing) return existing

    return Account.create(
      {
        householdId: household.id,
        name: spec.name,
        institution: spec.institution,
        kind: spec.kind,
        ownerUserId: spec.owner === 'owner' ? owner.id : null,
        currencyCode: household.currencyCode,
        externalAccountNumber: spec.externalAccountNumber ?? null,
        openingBalanceCents: 0,
        isActive: true,
        sortOrder,
        createdByUserId: owner.id,
      },
      { client: trx }
    )
  }

  protected async ensureCard(
    account: Account,
    cardSuffix: string,
    user: User,
    trx: TransactionClientContract
  ) {
    const existing = await AccountCard.query({ client: trx })
      .where('account_id', account.id)
      .where('card_suffix', cardSuffix)
      .first()
    if (existing) return existing

    return AccountCard.create(
      { accountId: account.id, cardSuffix, userId: user.id, label: null },
      { client: trx }
    )
  }
}
