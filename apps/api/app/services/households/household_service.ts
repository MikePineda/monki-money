import { DateTime } from 'luxon'
import User from '#models/user'
import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import type Household from '#models/household'
import HouseholdMember from '#models/household_member'
import { FieldError } from '#exceptions/field_error'
import HouseholdCreator from '#services/households/household_creator'
import { canRestore, deletionDate } from '#domain/households/deletion_window'
import type { NewHouseholdInput, UpdateHouseholdInput } from '#services/households/dto'
import {
  AlreadyInHousehold,
  HouseholdNotPendingDeletion,
  OwnerCannotLeave,
  RestoreWindowExpired,
} from '#exceptions/errors'

/**
 * Household settings and lifecycle. Deleting only schedules the deletion
 * (30-day restore window; the purge job arrives with the worker). Callers
 * authorize first (HouseholdPolicy).
 */
@inject()
export default class HouseholdService {
  constructor(protected creator: HouseholdCreator) {}

  /**
   * A household for a user who has none (left one, or never had one): owner
   * membership, shared taxonomy in the household's locale, current
   * household set. MVP rule "one user = one household": 409 when the user
   * already has one. The user row is locked so two parallel requests cannot
   * both create one.
   */
  async createFor(user: User, input: NewHouseholdInput) {
    return db.transaction(async (trx) => {
      const owner = await User.query({ client: trx }).where('id', user.id).forUpdate().firstOrFail()
      const membership = await HouseholdMember.query({ client: trx })
        .where('user_id', owner.id)
        .first()
      if (owner.currentHouseholdId !== null || membership) throw new AlreadyInHousehold()

      return this.creator.create(
        {
          owner,
          name: input.name,
          locale: input.locale ?? owner.locale,
          timezone: input.timezone,
          currencyCode: input.currencyCode,
        },
        trx
      )
    })
  }

  async update(household: Household, input: UpdateHouseholdInput) {
    if (input.name !== undefined) household.name = input.name
    if (input.locale !== undefined) household.locale = input.locale
    if (input.timezone !== undefined) household.timezone = input.timezone
    await household.save()
    return household
  }

  async members(household: Household) {
    return HouseholdMember.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .preload('user')
      .orderBy('joined_at', 'asc')
      .orderBy('id', 'asc')
  }

  /**
   * A member leaves the household; owners cannot (they delete it). Only the
   * membership goes: the leaver's ledger rows stay as they are (payer,
   * creator, account owner and card ids keep pointing at them, and their
   * private rows become ordinary rows, app/domain/ledger/privacy.ts). The
   * session stays valid; with no current household the next household
   * request answers E_NO_HOUSEHOLD.
   */
  async leave(membership: HouseholdMember, user: User) {
    if (membership.isOwner) throw new OwnerCannotLeave()

    await db.transaction(async (trx) => {
      membership.useTransaction(trx)
      await membership.delete()
      user.useTransaction(trx)
      user.currentHouseholdId = null
      await user.save()
    })
  }

  /** Needs the owner's password: deleting is irreversible after the window. */
  async scheduleDeletion(household: Household, owner: User, password: string) {
    if (!(await owner.verifyPassword(password))) throw new FieldError('password', 'matches')

    household.status = 'pending_deletion'
    household.deletionScheduledAt = deletionDate(DateTime.now())
    await household.save()
    return household
  }

  async restore(household: Household) {
    if (household.status !== 'pending_deletion') throw new HouseholdNotPendingDeletion()
    if (!canRestore(household.deletionScheduledAt, DateTime.now())) throw new RestoreWindowExpired()

    household.status = 'active'
    household.deletionScheduledAt = null
    await household.save()
    return household
  }
}
