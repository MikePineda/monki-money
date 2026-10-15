import type User from '#models/user'
import type Account from '#models/account'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type Household from '#models/household'
import type { Locale } from '@monkimoney/shared'
import type HouseholdMember from '#models/household_member'
import { UserFactory } from '#database/factories/user_factory'
import { AccountFactory } from '#database/factories/account_factory'
import HouseholdCreator from '#services/households/household_creator'

export interface HouseholdAccountSpec {
  name?: string
  kind?: Account['kind']
  /** Index into `users` of the owner; omit for a joint account. */
  owner?: number
  externalAccountNumber?: string | null
  openingBalanceCents?: number
  openingBalanceDate?: string | null
}

export interface CreateHouseholdOptions {
  /** Number of members (the first one is the owner). Default 1. */
  users?: number
  locale?: Locale
  /** Seed the shared taxonomy. Default false (keeps tests fast). */
  taxonomy?: boolean
  accounts?: HouseholdAccountSpec[]
  name?: string
}

export interface TestHousehold {
  household: Household
  users: User[]
  memberships: HouseholdMember[]
  owner: User
  /** Second user (a plain member), when `users >= 2`. */
  member: User
  accounts: Account[]
}

/**
 * Laravel-style fixture builder: a household with N verified users (first =
 * owner, rest = members), each with it as current household, and optional
 * accounts and taxonomy. Built through the same service sign-up uses.
 */
export async function createHousehold(
  options: CreateHouseholdOptions = {}
): Promise<TestHousehold> {
  const locale = options.locale ?? 'en'
  const users = await UserFactory.merge({ locale }).createMany(options.users ?? 1)
  const creator = await app.container.make(HouseholdCreator)

  return db.transaction(async (trx) => {
    const { household, membership } = await creator.create(
      {
        owner: users[0],
        name: options.name ?? 'Test home',
        locale,
        withTaxonomy: options.taxonomy ?? false,
      },
      trx
    )

    const memberships = [membership]
    for (const user of users.slice(1)) {
      memberships.push(await creator.addMember(household, { user, role: 'member' }, trx))
    }

    const accounts: Account[] = []
    for (const [index, spec] of (options.accounts ?? []).entries()) {
      accounts.push(
        await AccountFactory.client(trx)
          .merge({
            householdId: household.id,
            name: spec.name ?? `Account ${index + 1}`,
            kind: spec.kind ?? 'transaction',
            ownerUserId: spec.owner === undefined ? null : users[spec.owner].id,
            externalAccountNumber: spec.externalAccountNumber ?? null,
            openingBalanceCents: spec.openingBalanceCents ?? 0,
            openingBalanceDate: spec.openingBalanceDate ?? null,
            sortOrder: index,
          })
          .create()
      )
    }

    return { household, users, memberships, owner: users[0], member: users[1], accounts }
  })
}
