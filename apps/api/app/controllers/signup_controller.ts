import { inject } from '@adonisjs/core'
import { isLocale } from '@monkimoney/shared'
import { signupValidator } from '#validators/auth'
import type { HttpContext } from '@adonisjs/core/http'
import { clientIp } from '#services/http/client_ip'
import { RegistrationClosed } from '#exceptions/errors'
import UserTransformer from '#transformers/user_transformer'
import { startWebSession } from '#services/auth/web_session'
import { authAttempts, throttleKey } from '#services/auth/throttles'
import HouseholdTransformer from '#transformers/household_transformer'
import RegistrationService from '#services/auth/registration_service'
import { TurnstileVerifier } from '#services/auth/turnstile_verifier'

@inject()
export default class SignupController {
  constructor(
    protected registration: RegistrationService,
    protected turnstile: TurnstileVerifier
  ) {}

  /**
   * POST /auth/signup (only while REGISTRATION_OPEN): creates the user and
   * their household, sends the verification mail and logs in.
   *
   * Order matters: closed answers 403 before anything else (validation would
   * reveal which emails exist), then the bot check (when TURNSTILE_SECRET is
   * set), then every attempt counts toward the per-IP limit (the
   * unique-email check is an enumeration oracle when open).
   */
  async store(ctx: HttpContext) {
    if (!this.registration.isOpen()) throw new RegistrationClosed()
    const ip = clientIp(ctx)
    await this.turnstile.assertHuman(ctx.request.input('turnstileToken'), ip)
    await authAttempts().consume(throttleKey('signup', ip))

    const payload = await ctx.request.validateUsing(signupValidator)

    const { user, household } = await this.registration.register({
      fullName: payload.fullName,
      email: payload.email,
      password: payload.password,
      householdName: payload.householdName,
      locale: payload.locale ?? (isLocale(ctx.i18n.locale) ? ctx.i18n.locale : 'en'),
    })
    await startWebSession(ctx, user)

    ctx.response.status(201)
    return ctx.serialize({
      user: UserTransformer.transform(user),
      household: HouseholdTransformer.transform(household),
    })
  }
}
