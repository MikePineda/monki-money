import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import HouseholdPolicy from '#policies/household_policy'
import InvitationTransformer from '#transformers/invitation_transformer'
import InvitationService from '#services/invitations/invitation_service'
import { createInvitationValidator, invitationParamsValidator } from '#validators/household'

/** Owner-only management of pending invitations. */
@inject()
export default class HouseholdInvitationsController {
  constructor(protected invitations: InvitationService) {}

  /** GET /household/invitations */
  async index(ctx: HttpContext) {
    await ctx.bouncer.with(HouseholdPolicy).authorize('invite', ctx.membership)

    const invitations = await this.invitations.pending(ctx.household)

    return ctx.serialize(InvitationTransformer.transform(invitations))
  }

  /**
   * POST /household/invitations: emails the link and also returns it once
   * (`url`), so the owner can share it another way.
   */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createInvitationValidator)
    await ctx.bouncer.with(HouseholdPolicy).authorize('invite', ctx.membership)

    const { invitation, url } = await this.invitations.create(
      ctx.household,
      ctx.auth.getUserOrFail(),
      { email: payload.email, role: payload.role ?? 'member' }
    )

    ctx.response.status(201)
    return ctx.serialize(InvitationTransformer.transform(invitation, url))
  }

  /** DELETE /household/invitations/:id */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(invitationParamsValidator)
    await ctx.bouncer.with(HouseholdPolicy).authorize('invite', ctx.membership)

    await this.invitations.revoke(ctx.household, params.id)

    return ctx.response.noContent()
  }
}
