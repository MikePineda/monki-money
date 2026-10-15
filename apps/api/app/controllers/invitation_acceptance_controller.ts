import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { clientIp } from '#services/http/client_ip'
import UserTransformer from '#transformers/user_transformer'
import { startWebSession } from '#services/auth/web_session'
import { authAttempts, throttleKey } from '#services/auth/throttles'
import HouseholdTransformer from '#transformers/household_transformer'
import InvitationService from '#services/invitations/invitation_service'
import { acceptInvitationValidator, invitationTokenValidator } from '#validators/household'

/**
 * Public side of invitations (the invitee may have no account). Failed
 * lookups/accepts count toward the per-IP auth limit, so tokens cannot be
 * brute-forced.
 */
@inject()
export default class InvitationAcceptanceController {
  constructor(protected invitations: InvitationService) {}

  /** GET /auth/invitations/:token */
  async show(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(invitationTokenValidator)

    const [throttled, result] = await authAttempts().penalize(
      throttleKey('invitation', clientIp(ctx)),
      () => this.invitations.show(params.token)
    )
    if (throttled) throw throttled

    const { invitation, userExists } = result
    return ctx.serialize({
      email: invitation.email,
      role: invitation.role,
      householdName: invitation.household.name,
      inviterName: invitation.invitedBy?.fullName ?? null,
      expiresAt: invitation.expiresAt.toUTC().toISO()!,
      userExists,
    })
  }

  /** POST /auth/invitations/:token/accept: joins the household and logs in. */
  async store(ctx: HttpContext) {
    const { params, ...input } = await ctx.request.validateUsing(acceptInvitationValidator)

    const [throttled, result] = await authAttempts().penalize(
      throttleKey('invitation', clientIp(ctx)),
      () => this.invitations.accept(params.token, input)
    )
    if (throttled) throw throttled

    await startWebSession(ctx, result.user)
    return ctx.serialize({
      user: UserTransformer.transform(result.user),
      household: HouseholdTransformer.transform(result.household),
    })
  }
}
