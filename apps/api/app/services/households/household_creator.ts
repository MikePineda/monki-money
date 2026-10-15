import { DateTime } from 'luxon'
import { inject } from '@adonisjs/core'
import Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import HouseholdMember from '#models/household_member'
import TaxonomySeeder from '#services/households/taxonomy_seeder'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { AddMemberInput, CreateHouseholdInput } from '#services/households/dto'

/**
 * Creates households and memberships. Used by sign-up, invitation accept,
 * the production bootstrap seeder and the E2E seed, so every household is
 * born the same way: owner membership, current household set, taxonomy.
 */
@inject()
export default class HouseholdCreator {
  constructor(protected taxonomy: TaxonomySeeder) {}

  async create(
    input: CreateHouseholdInput,
    trx?: TransactionClientContract
  ): Promise<{ household: Household; membership: HouseholdMember }> {
    if (!trx) return db.transaction((own) => this.create(input, own))

    const household = await Household.create(
      {
        name: input.name,
        locale: input.locale,
        timezone: input.timezone ?? 'Australia/Brisbane',
        currencyCode: input.currencyCode ?? 'AUD',
        plan: 'free',
        status: 'active',
        settings: {},
      },
      { client: trx }
    )

    const membership = await this.addMember(household, { user: input.owner, role: 'owner' }, trx)

    if (input.withTaxonomy !== false) {
      await this.taxonomy.seed(household.id, input.locale, trx)
    }

    return { household, membership }
  }

  /**
   * Adds a user to a household and makes it their current one (MVP: one
   * user = one household).
   */
  async addMember(household: Household, input: AddMemberInput, trx: TransactionClientContract) {
    const membership = await HouseholdMember.create(
      {
        householdId: household.id,
        userId: input.user.id,
        role: input.role,
        displayName: input.displayName ?? null,
        joinedAt: DateTime.now(),
      },
      { client: trx }
    )

    input.user.useTransaction(trx)
    input.user.currentHouseholdId = household.id
    await input.user.save()

    return membership
  }
}
