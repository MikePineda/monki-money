import { DateTime } from 'luxon'
import type User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import type Household from '#models/household'
import HouseholdMember from '#models/household_member'
import { FieldError } from '#exceptions/field_error'
import type { UpdateHouseholdInput } from '#services/households/dto'
import { canRestore, deletionDate } from '#domain/households/deletion_window'
import {
  HouseholdNotPendingDeletion,
  OwnerCannotLeave,
  RestoreWindowExpired,
} from '#exceptions/errors'

/**
 * Household settings and lifecycle. Deleting only schedules the deletion
 * (30-day restore window; the purge job arrives with the worker). Callers
 * authorize first (HouseholdPolicy).
 */
export default class HouseholdService {
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
