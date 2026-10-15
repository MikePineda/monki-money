import { DateTime } from 'luxon'
import User from '#models/user'
import { inject } from '@adonisjs/core'
import Invitation from '#models/invitation'
import type Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import Outbox from '#services/mail/outbox'
import InvitationMail from '#mails/invitation_mail'
import HouseholdMember from '#models/household_member'
import { appUrl } from '#services/http/app_url'
import { FieldError } from '#exceptions/field_error'
import { findInHousehold } from '#repositories/scoped'
import type { MemberRole } from '@monkimoney/shared'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { AcceptInvitationInput } from '#services/auth/dto'
import HouseholdCreator from '#services/households/household_creator'
import { AlreadyInHousehold, InvitationExpired } from '#exceptions/errors'
import {
  generateInvitationToken,
  hashInvitationToken,
  INVITATION_TTL_DAYS,
} from '#domain/households/invitation_token'

const NEW_PASSWORD_MIN_LENGTH = 10

/**
 * Inviting the partner (owner only, checked by the caller) and accepting.
 * The clear token exists only in the response and the email; the database
 * keeps its sha256. Accepting ignores REGISTRATION_OPEN: the token proves
 * the email, so the new account is born verified.
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

    const url = appUrl(`/invite/${token}`)
    await this.outbox.send(
      new InvitationMail(input.email, household.locale, household.name, inviter.fullName, url)
    )

    return { invitation, url }
  }

  async revoke(household: Household, invitationId: number) {
    const invitation = await findInHousehold(Invitation, household, invitationId)
    await invitation.delete()
  }

  /** Public preview of an invitation: 404 unknown, 410 expired or used. */
  async show(token: string) {
    const invitation = await Invitation.query()
      .where('token_hash', hashInvitationToken(token))
      .preload('household')
      .preload('invitedBy')
      .firstOrFail()
    if (!invitation.isUsableAt(DateTime.now())) throw new InvitationExpired()

    const userExists = (await User.findBy('email', invitation.email)) !== null
    return { invitation, userExists }
  }

  async accept(token: string, input: AcceptInvitationInput) {
    return db.transaction(async (trx) => {
      const invitation = await Invitation.query({ client: trx })
        .where('token_hash', hashInvitationToken(token))
        .forUpdate()
        .preload('household')
        .firstOrFail()
      if (!invitation.isUsableAt(DateTime.now())) throw new InvitationExpired()

      const user = await this.inviteeAccount(invitation, input, trx)

      const otherMembership = await HouseholdMember.query({ client: trx })
        .where('user_id', user.id)
        .first()
      if (otherMembership) throw new AlreadyInHousehold()

      const membership = await this.households.addMember(
        invitation.household,
        { user, role: invitation.role },
        trx
      )

      invitation.useTransaction(trx)
      invitation.acceptedAt = DateTime.now()
      await invitation.save()

      return { user, household: invitation.household, membership }
    })
  }

  /** The existing account (proved with its password) or a new, verified one. */
  protected async inviteeAccount(
    invitation: Invitation,
    input: AcceptInvitationInput,
    trx: TransactionClientContract
  ): Promise<User> {
    const existing = await User.query({ client: trx }).where('email', invitation.email).first()

    if (existing) {
      if (!input.password || !(await existing.verifyPassword(input.password))) {
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
