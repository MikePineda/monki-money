import { DateTime } from 'luxon'
import User from '#models/user'
import { inject } from '@adonisjs/core'
import Household from '#models/household'
import Invitation from '#models/invitation'
import db from '@adonisjs/lucid/services/db'
import Outbox from '#services/mail/outbox'
import { entitlementsFor } from '#config/plans'
import InvitationMail from '#mails/invitation_mail'
import HouseholdMember from '#models/household_member'
import { appUrl } from '#services/http/app_url'
import { FieldError } from '#exceptions/field_error'
import { findInHousehold } from '#repositories/scoped'
import type { MemberRole } from '@monkimoney/shared'
import type { AcceptInvitationInput } from '#services/auth/dto'
import HouseholdCreator from '#services/households/household_creator'
import PushSubscriptionService from '#services/push/push_subscription_service'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { AlreadyInHousehold, InvitationExpired, MemberLimitReached } from '#exceptions/errors'
import {
  generateInvitationToken,
  hashInvitationToken,
  INVITATION_TTL_DAYS,
} from '#domain/households/invitation_token'

const NEW_PASSWORD_MIN_LENGTH = 10

/**
 * Inviting the partner (owner only, checked by the caller) and accepting.
 *
 * The clear token only ever travels in the email to the invited address:
 * the API never returns it (not even to the owner), the database keeps its
 * sha256. That is what lets accept create the account already verified and
 * ignore REGISTRATION_OPEN: holding the token proves access to that inbox.
 * Otherwise an owner could "invite" any address and accept it himself.
 */
@inject()
export default class InvitationService {
  constructor(
    protected outbox: Outbox,
    protected households: HouseholdCreator
  ) {}

  async pending(household: Household) {
    return Invitation.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .whereNull('accepted_at')
      .orderBy('created_at', 'desc')
  }

  async create(household: Household, inviter: User, input: { email: string; role: MemberRole }) {
    const alreadyMember = await HouseholdMember.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .whereHas('user', (user) => user.where('email', input.email))
      .first()
    if (alreadyMember) throw new FieldError('email', 'alreadyMember')
    await this.assertRoomForAnotherMember(household)

    const token = generateInvitationToken()
    const invitation = await db.transaction(async (trx) => {
      // A new invitation replaces any pending one for the same address.
      await Invitation.query({ client: trx })
        .withScopes((scopes) => scopes.forHousehold(household))
        .where('email', input.email)
        .whereNull('accepted_at')
        .delete()

      return Invitation.create(
        {
          householdId: household.id,
          email: input.email,
          role: input.role,
          tokenHash: hashInvitationToken(token),
          invitedByUserId: inviter.id,
          expiresAt: DateTime.now().plus({ days: INVITATION_TTL_DAYS }),
          acceptedAt: null,
        },
        { client: trx }
      )
    })

    await this.mail(household, inviter, invitation, token)
    return invitation
  }

  /** New link (the previous one stops working) and a fresh 7-day window. */
  async resend(household: Household, inviter: User, invitationId: number) {
    const invitation = await findInHousehold(Invitation, household, invitationId)
    if (invitation.acceptedAt) throw new InvitationExpired()

    const token = generateInvitationToken()
    invitation.tokenHash = hashInvitationToken(token)
    invitation.expiresAt = DateTime.now().plus({ days: INVITATION_TTL_DAYS })
    await invitation.save()

    await this.mail(household, inviter, invitation, token)
    return invitation
  }

  async revoke(household: Household, invitationId: number) {
    const invitation = await findInHousehold(Invitation, household, invitationId)
    await invitation.delete()
  }

  /**
   * Public preview: 404 unknown; 410 expired, used, or the household is no
   * longer active. Says nothing about whether the address has an account.
   */
  async show(token: string) {
    const invitation = await Invitation.query()
      .where('token_hash', hashInvitationToken(token))
      .preload('household')
      .preload('invitedBy')
      .firstOrFail()
    this.assertUsable(invitation)
    return invitation
  }

  async accept(token: string, input: AcceptInvitationInput) {
    return db.transaction(async (trx) => {
      const invitation = await Invitation.query({ client: trx })
        .where('token_hash', hashInvitationToken(token))
        .forUpdate()
        .preload('household')
        .firstOrFail()
      this.assertUsable(invitation)

      // Serializes concurrent accepts into the same household (member limit).
      const household = await Household.query({ client: trx })
        .where('id', invitation.householdId)
        .forUpdate()
        .firstOrFail()
      await this.assertRoomForAnotherMember(household, trx)

      const user = await this.inviteeAccount(invitation, input, trx)

      const otherMembership = await HouseholdMember.query({ client: trx })
        .where('user_id', user.id)
        .first()
      if (otherMembership) throw new AlreadyInHousehold()

      const membership = await this.households.addMember(
        household,
        { user, role: invitation.role },
        trx
      )
      await PushSubscriptionService.followPerson(user.id, household.id, trx)

      invitation.useTransaction(trx)
      invitation.acceptedAt = DateTime.now()
      await invitation.save()

      return { user, household, membership }
    })
  }

  protected assertUsable(invitation: Invitation) {
    const householdActive = invitation.household.status === 'active'
    if (!householdActive || !invitation.isUsableAt(DateTime.now())) {
      throw new InvitationExpired()
    }
  }

  /** Plan limit (`config/plans.ts`): 402 when the household is full. */
  protected async assertRoomForAnotherMember(
    household: Household,
    trx?: TransactionClientContract
  ) {
    const members = await HouseholdMember.query(trx ? { client: trx } : {})
      .where('household_id', household.id)
      .count('* as total')
      .firstOrFail()
    const total = Number(members.$extras['total'])
    if (total >= entitlementsFor(household.plan).maxMembers) throw new MemberLimitReached()
  }

  protected async mail(household: Household, inviter: User, invitation: Invitation, token: string) {
    await this.outbox.send(
      new InvitationMail(
        invitation.email,
        household.locale,
        household.name,
        inviter.fullName,
        appUrl(`/invite/${token}`)
      )
    )
  }

  /** The existing account (proved with its password) or a new, verified one. */
  protected async inviteeAccount(
    invitation: Invitation,
    input: AcceptInvitationInput,
    trx: TransactionClientContract
  ): Promise<User> {
    const existing = await User.query({ client: trx }).where('email', invitation.email).first()

    if (existing) {
      if (!input.password) throw new FieldError('password', 'required')
      if (!(await existing.verifyPassword(input.password))) {
        throw new FieldError('password', 'matches')
      }
      if (!existing.isEmailVerified) {
        existing.useTransaction(trx)
        existing.emailVerifiedAt = DateTime.now()
        await existing.save()
      }
      return existing
    }

    if (!input.fullName) throw new FieldError('fullName', 'required')
    if (!input.password) throw new FieldError('password', 'required')
    if (input.password.length < NEW_PASSWORD_MIN_LENGTH) {
      throw new FieldError('password', 'minLength', { min: NEW_PASSWORD_MIN_LENGTH })
    }

    // Verified: the token reached this address (see the class comment).
    return User.create(
      {
        email: invitation.email,
        fullName: input.fullName,
        password: input.password,
        locale: invitation.household.locale,
        theme: 'system',
        sessionVersion: 1,
        emailVerifiedAt: DateTime.now(),
      },
      { client: trx }
    )
  }
}
