import { inject } from '@adonisjs/core'
import { loginValidator } from '#validators/auth'
import type { HttpContext } from '@adonisjs/core/http'
import LoginService from '#services/auth/login_service'
import { clientIp } from '#services/http/client_ip'
import ProfileService from '#services/auth/profile_service'
import UserTransformer from '#transformers/user_transformer'
import { startWebSession } from '#services/auth/web_session'
import { describeSession, householdPeople } from '#services/auth/current_session'
import HouseholdTransformer from '#transformers/household_transformer'
import MemberSummaryTransformer from '#transformers/member_summary_transformer'
import MembershipTransformer from '#transformers/membership_transformer'
import { TurnstileVerifier } from '#services/auth/turnstile_verifier'

@inject()
export default class SessionsController {
  constructor(
    protected login: LoginService,
    protected profile: ProfileService,
    protected turnstile: TurnstileVerifier
  ) {}

  /**
   * POST /auth/login: bot check (when TURNSTILE_SECRET is set), throttled
   * credential check, then a fresh session.
   */
  async store(ctx: HttpContext) {
    const ip = clientIp(ctx)
    await this.turnstile.assertHuman(ctx.request.input('turnstileToken'), ip)
    const { email, password } = await ctx.request.validateUsing(loginValidator)

    const user = await this.login.attempt(email, password, ip)
    await startWebSession(ctx, user)

    const { household } = await describeSession(user)
    return ctx.serialize({
      user: UserTransformer.transform(user),
      household: HouseholdTransformer.transform(household),
    })
  }

  /**
   * GET /auth/me: the SPA's boot call, with the members' names and colours
   * (and the partner's) so screens that only show who paid need no other
   * call. Guests get 401 (and the XSRF-TOKEN cookie, like any GET).
   */
  async show(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail()
    const session = await describeSession(user)
    const people = await householdPeople(user, session.household)

    return ctx.serialize({
      user: UserTransformer.transform(session.user),
      household: HouseholdTransformer.transform(session.household),
      membership: MembershipTransformer.transform(session.membership),
      // A plain copy: the registry types `{ data }` only for JSON-shaped values.
      entitlements: session.entitlements ? { ...session.entitlements } : null,
      flags: session.flags,
      members: MemberSummaryTransformer.transform(people.members),
      partner: MemberSummaryTransformer.transform(people.partner),
    })
  }

  /** POST /auth/logout: ends this session only. */
  async destroy({ auth, response }: HttpContext) {
    await auth.use('web').logout()
    return response.noContent()
  }

  /** POST /auth/logout-all: revokes every session of the user, this one included. */
  async destroyAll({ auth, response }: HttpContext) {
    await this.profile.revokeAllSessions(auth.getUserOrFail())
    await auth.use('web').logout()
    return response.noContent()
  }
}
