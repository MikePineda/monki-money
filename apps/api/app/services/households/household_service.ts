import { DateTime } from 'luxon'
import User from '#models/user'
import Account from '#models/account'
import AccountCard from '#models/account_card'
import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import type Household from '#models/household'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import HouseholdMember from '#models/household_member'
import HouseholdOwnershipTransfer from '#models/household_ownership_transfer'
import { AuthorizationResponse, errors as bouncerErrors } from '@adonisjs/bouncer'
import { FieldError } from '#exceptions/field_error'
import HouseholdCreator from '#services/households/household_creator'
import { canRestore, deletionDate } from '#domain/households/deletion_window'
import type { NewHouseholdInput, UpdateHouseholdInput } from '#services/households/dto'
import {
  AlreadyInHousehold,
  HouseholdNotPendingDeletion,
  MemberNotFound,
  OwnerCannotLeave,
  RestoreWindowExpired,
} from '#exceptions/errors'

/**
 * Runs a password re-check, e.g. through the per-user limiter (wrong
 * passwords count toward it, nothing else does).
 */
export type PasswordAttempt = (check: () => Promise<void>) => Promise<void>

const unthrottled: PasswordAttempt = (check) => check()

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

      const created = await this.creator.create(
        {
          owner,
          name: input.name,
          locale: input.locale ?? owner.locale,
          timezone: input.timezone,
          currencyCode: input.currencyCode,
        },
        trx
      )
      // Reload the column defaults (e.g. the member colour) so the response
      // has the same shape as GET /auth/me.
      await created.household.refresh()
      await created.membership.refresh()
      return created
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
   * A member leaves the household; owners cannot (they hand ownership over
   * first, or delete it). The membership goes and so does the leaver's
   * claim on the money that stays behind: their personal accounts become
   * joint and their cards lose their user, so new rows on them default to
   * whoever enters them (app/domain/ledger/payer.ts) instead of someone who
   * is gone. History is history: payer and creator of existing rows keep
   * pointing at them (their private rows become ordinary rows,
   * app/domain/ledger/privacy.ts). The session stays valid; with no current
   * household the next household request answers E_NO_HOUSEHOLD.
   */
  async leave(membership: HouseholdMember, user: User) {
    if (membership.isOwner) throw new OwnerCannotLeave()

    await db.transaction(async (trx) => {
      // Decide on the committed role: a handover may have made them the owner meanwhile.
      const current = await this.lockedMembership(membership.householdId, user.id, trx)
      if (!current) throw new MemberNotFound()
      if (current.isOwner) throw new OwnerCannotLeave()

      await current.delete()
      await this.releaseMember(current.householdId, user.id, trx)
      user.useTransaction(trx)
      user.currentHouseholdId = null
      await user.save()
    })
  }

  /**
   * What still names a former member as the person behind future rows, so
   * nothing new is attributed to someone who is gone: their personal
   * accounts become joint, their cards (on any account of the household)
   * keep the suffix but no person, and merchant rules, recurring items and
   * import rows still to confirm (suggestion and decision) lose them as the
   * payer. Confirmed rows and the ledger are history and stay.
   */
  protected async releaseMember(
    householdId: number,
    userId: number,
    trx: TransactionClientContract
  ) {
    const now = new Date()
    await Account.query({ client: trx })
      .where('household_id', householdId)
      .where('owner_user_id', userId)
      .update({ owner_user_id: null, updated_at: now })
    await AccountCard.query({ client: trx })
      .where('user_id', userId)
      .whereIn(
        'account_id',
        Account.query({ client: trx }).where('household_id', householdId).select('id')
      )
      .update({ user_id: null, updated_at: now })
    for (const table of ['merchant_rules', 'recurring_items']) {
      await trx
        .from(table)
        .where('household_id', householdId)
        .where('paid_by_user_id', userId)
        .update({ paid_by_user_id: null, updated_at: now })
    }
    await trx
      .from('import_rows')
      .where('household_id', householdId)
      .whereNull('confirmed_at')
      .where('suggested_paid_by_user_id', userId)
      .update({ suggested_paid_by_user_id: null, updated_at: now })
    // A decided payer falls back to the (now empty) suggestion.
    await trx
      .from('import_rows')
      .where('household_id', householdId)
      .whereNull('confirmed_at')
      .whereRaw(`decision -> 'paidByUserId' = to_jsonb(?::integer)`, [userId])
      .update({ decision: trx.raw(`decision - 'paidByUserId'`), updated_at: now })
  }

  /** The membership of `userId`, locked until the transaction ends (null once gone). */
  protected lockedMembership(householdId: number, userId: number, trx: TransactionClientContract) {
    return HouseholdMember.query({ client: trx })
      .where('household_id', householdId)
      .where('user_id', userId)
      .forUpdate()
      .first()
  }

  /** Still the owner on the committed, locked row, or 403 like the policy. */
  protected async assertStillOwner(
    householdId: number,
    userId: number,
    trx: TransactionClientContract
  ) {
    const current = await this.lockedMembership(householdId, userId, trx)
    if (!current?.isOwner) {
      throw new bouncerErrors.E_AUTHORIZATION_FAILURE(AuthorizationResponse.deny())
    }
    return current
  }

  protected async checkPassword(user: User, password: string) {
    if (!(await user.verifyPassword(password))) throw new FieldError('password', 'matches')
  }

  /**
   * The owner hands the household over to another member (who becomes the
   * owner) and stays as a member, so they can then leave. Needs the
   * owner's password, like deleting. `userId` must be another member of
   * this household: anyone else answers 404 (never 403), the owner
   * themselves 422. Both memberships are locked and re-read in the
   * transaction, so two concurrent transfers cannot leave two owners (the
   * loser finds it is no longer the owner: 403). The handover is audited
   * in `household_ownership_transfers`. Only the password check goes
   * through `attempt` (the controller's re-check limiter): a wrong target
   * is not a password guess.
   */
  async transferOwnership(
    household: Household,
    owner: User,
    userId: number,
    password: string,
    attempt: PasswordAttempt = unthrottled
  ) {
    if (userId === owner.id) throw new FieldError('userId', 'self')
    const target = await HouseholdMember.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('user_id', userId)
      .first()
    if (!target) throw new MemberNotFound()
    await attempt(() => this.checkPassword(owner, password))

    await db.transaction(async (trx) => {
      const memberships = await HouseholdMember.query({ client: trx })
        .withScopes((scopes) => scopes.forHousehold(household))
        .whereIn('user_id', [owner.id, userId])
        .orderBy('id')
        .forUpdate()
      const current = memberships.find((membership) => membership.userId === owner.id)
      const next = memberships.find((membership) => membership.userId === userId)
      if (!current?.isOwner) {
        throw new bouncerErrors.E_AUTHORIZATION_FAILURE(AuthorizationResponse.deny())
      }
      if (!next) throw new MemberNotFound()

      // Demote first: the household never has two owners, not even mid-transaction.
      current.role = 'member'
      await current.save()
      next.role = 'owner'
      await next.save()
      await HouseholdOwnershipTransfer.create(
        { householdId: household.id, fromUserId: owner.id, toUserId: userId },
        { client: trx }
      )
    })

    return this.members(household)
  }

  /**
   * Needs the owner's password: deleting is irreversible after the window.
   * The caller must still be the owner on the locked membership (a handover
   * committed meanwhile answers 403).
   */
  async scheduleDeletion(
    household: Household,
    owner: User,
    password: string,
    attempt: PasswordAttempt = unthrottled
  ) {
    await attempt(() => this.checkPassword(owner, password))

    await db.transaction(async (trx) => {
      await this.assertStillOwner(household.id, owner.id, trx)
      household.useTransaction(trx)
      household.status = 'pending_deletion'
      household.deletionScheduledAt = deletionDate(DateTime.now())
      await household.save()
    })
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
