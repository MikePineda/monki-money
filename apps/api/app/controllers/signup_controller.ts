import { inject } from '@adonisjs/core'
import { signupValidator } from '#validators/auth'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'
import { startWebSession } from '#services/auth/web_session'
import HouseholdTransformer from '#transformers/household_transformer'
import RegistrationService from '#services/auth/registration_service'

@inject()
export default class SignupController {
  constructor(protected registration: RegistrationService) {}

  /**
   * POST /auth/signup (only while REGISTRATION_OPEN): creates the user and
   * their household, sends the verification mail and logs in.
   */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(signupValidator)

    const { user, household } = await this.registration.register({
      ...payload,
      locale: payload.locale ?? (ctx.i18n.locale as 'en' | 'es'),
    })
    await startWebSession(ctx, user)

    ctx.response.status(201)
    return ctx.serialize({
      user: UserTransformer.transform(user),
      household: HouseholdTransformer.transform(household),
    })
  }
}
