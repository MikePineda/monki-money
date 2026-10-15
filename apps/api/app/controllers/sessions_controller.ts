import { inject } from '@adonisjs/core'
import { loginValidator } from '#validators/auth'
import type { HttpContext } from '@adonisjs/core/http'
import LoginService from '#services/auth/login_service'
import { clientIp } from '#services/http/client_ip'
import ProfileService from '#services/auth/profile_service'
import UserTransformer from '#transformers/user_transformer'
import { startWebSession } from '#services/auth/web_session'
import { describeSession } from '#services/auth/current_session'
import HouseholdTransformer from '#transformers/household_transformer'
import MembershipTransformer from '#transformers/membership_transformer'

@inject()
export default class SessionsController {
  constructor(
    protected login: LoginService,
    protected profile: ProfileService
  ) {}

  /** POST /auth/login: throttled credential check, then a fresh session. */
  async store(ctx: HttpContext) {
    const { email, password } = await ctx.request.validateUsing(loginValidator)

    const user = await this.login.attempt(email, password, clientIp(ctx))
    await startWebSession(ctx, user)

    const { household } = await describeSession(user)
    return ctx.serialize({
      user: UserTransformer.transform(user),
      household: HouseholdTransformer.transform(household),
    })
  }

  /**
   * GET /auth/me: the SPA's boot call. Guests get 401 (and the XSRF-TOKEN
   * cookie, like any GET).
   */
  async show(ctx: HttpContext) {
    const session = await describeSession(ctx.auth.getUserOrFail())

    return ctx.serialize({
      user: UserTransformer.transform(session.user),
      household: HouseholdTransformer.transform(session.household),
      membership: MembershipTransformer.transform(session.membership),
      entitlements: session.entitlements,
      flags: session.flags,
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
