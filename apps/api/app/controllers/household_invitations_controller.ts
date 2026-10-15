import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import HouseholdPolicy from '#policies/household_policy'
import InvitationTransformer from '#transformers/invitation_transformer'
import InvitationService from '#services/invitations/invitation_service'
import { invitationSends, throttleKey } from '#services/auth/throttles'
import { createInvitationValidator, invitationParamsValidator } from '#validators/household'

/**
 * Owner-only management of pending invitations. The link is only ever
 * emailed to the invitee; these endpoints never return it.
 */
@inject()
export default class HouseholdInvitationsController {
  constructor(protected invitations: InvitationService) {}

  /** GET /household/invitations: email, role, expiry (resend/revoke by id). */
  async index(ctx: HttpContext) {
    await ctx.bouncer.with(HouseholdPolicy).authorize('invite', ctx.membership)

    const invitations = await this.invitations.pending(ctx.household)

    return ctx.serialize(InvitationTransformer.transform(invitations))
  }

  /** POST /household/invitations: emails the link (10 mails/hour per household). */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createInvitationValidator)
    await ctx.bouncer.with(HouseholdPolicy).authorize('invite', ctx.membership)
    await invitationSends().consume(throttleKey('invite', ctx.household.id))

    const invitation = await this.invitations.create(ctx.household, ctx.auth.getUserOrFail(), {
      email: payload.email,
      role: payload.role ?? 'member',
    })

    ctx.response.status(201)
    return ctx.serialize(InvitationTransformer.transform(invitation))
  }

  /** POST /household/invitations/:id/resend: a fresh link by email. */
  async resend(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(invitationParamsValidator)
    await ctx.bouncer.with(HouseholdPolicy).authorize('invite', ctx.membership)
    await invitationSends().consume(throttleKey('invite', ctx.household.id))

    const invitation = await this.invitations.resend(
      ctx.household,
      ctx.auth.getUserOrFail(),
      params.id
    )

    return ctx.serialize(InvitationTransformer.transform(invitation))
  }

  /** DELETE /household/invitations/:id */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(invitationParamsValidator)
    await ctx.bouncer.with(HouseholdPolicy).authorize('invite', ctx.membership)

    await this.invitations.revoke(ctx.household, params.id)

    return ctx.response.noContent()
  }
}
