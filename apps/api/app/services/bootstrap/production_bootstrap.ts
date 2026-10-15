import { DateTime } from 'luxon'
import User from '#models/user'
import Account from '#models/account'
import { inject } from '@adonisjs/core'
import Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import AccountCard from '#models/account_card'
import HouseholdMember from '#models/household_member'
import logger from '@adonisjs/core/services/logger'
import type { AccountKind, Locale } from '@monkimoney/shared'
import TaxonomySeeder from '#services/households/taxonomy_seeder'
import HouseholdCreator from '#services/households/household_creator'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { BootstrapInput, BootstrapUserInput, SmokeUserInput } from '#services/bootstrap/dto'

/** The smoke user's own household (see ensureSmokeUser). */
const SMOKE_HOUSEHOLD_NAME = 'Smoke'
const SMOKE_USER_NAME = 'Smoke Test'
const SMOKE_LOCALE: Locale = 'en'

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
 * re-running never duplicates rows nor resets a password. Also creates the
 * post-deploy smoke user in a household of its own (ensureSmokeUser).
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
      const memberJoined = member ? await this.ensureMembership(household, member, trx) : false

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
        [input.member, memberJoined ? member : null],
      ] as const) {
        if (person?.cardSuffix && user) {
          await this.ensureCard(everyday, person.cardSuffix, user, trx)
        }
      }

      return { household, owner, member, accounts }
    })
  }

  /**
   * The post-deploy smoke user: verified, owner of its own "Smoke" household
   * (taxonomy, no accounts), so the Bruno run never touches the real
   * household. Idempotent by email and never resets the password. A user with
   * that email who shares a household with anyone is left alone (warning
   * logged, by id only) and `household` comes back null.
   */
  async ensureSmokeUser(input: SmokeUserInput) {
    return db.transaction(async (trx) => {
      const user = await this.ensureUser(
        {
          email: input.email,
          fullName: SMOKE_USER_NAME,
          password: input.password,
          cardSuffix: null,
        },
        SMOKE_LOCALE,
        trx
      )

      const memberships = await HouseholdMember.query({ client: trx }).where('user_id', user.id)
      if (memberships.length === 0) {
        const { household } = await this.households.create(
          { owner: user, name: SMOKE_HOUSEHOLD_NAME, locale: SMOKE_LOCALE },
          trx
        )
        return { user, household }
      }

      const [membership] = memberships
      const members = await HouseholdMember.query({ client: trx })
        .where('household_id', membership.householdId)
        .count('* as total')
      if (memberships.length === 1 && Number(members[0].$extras.total) === 1) {
        const household = await Household.findOrFail(membership.householdId, { client: trx })
        return { user, household }
      }

      logger.warn(
        { userId: user.id },
        'production bootstrap: the smoke user shares a household with other users; left alone'
      )
      return { user, household: null }
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

  /**
   * Adds user 2 as a member unless already there. One user = one household:
   * someone who belongs to another household is left alone (warning logged,
   * by id only). Returns whether the user is a member of this household.
   */
  protected async ensureMembership(
    household: Household,
    user: User,
    trx: TransactionClientContract
  ): Promise<boolean> {
    const memberships = await HouseholdMember.query({ client: trx }).where('user_id', user.id)
    if (memberships.some((membership) => membership.householdId === household.id)) return true

    if (memberships.length > 0) {
      logger.warn(
        { userId: user.id, householdId: household.id },
        'production bootstrap: user 2 already belongs to another household; not added'
      )
      return false
    }

    await this.households.addMember(household, { user, role: 'member' }, trx)
    return true
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
