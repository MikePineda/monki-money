import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { updateProfileValidator } from '#validators/auth'
import ProfileService from '#services/auth/profile_service'
import UserTransformer from '#transformers/user_transformer'
import { refreshSessionVersion } from '#services/auth/web_session'
import { authAttempts, throttleKey } from '#services/auth/throttles'

@inject()
export default class ProfileController {
  constructor(protected profile: ProfileService) {}

  /**
   * PATCH /me: name, language, theme and password (with the current one).
   * Requests that check the current password count toward a per-user limit
   * (a stolen session cannot brute-force the password); others neither
   * count nor reset it.
   */
  async update(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updateProfileValidator)
    const current = ctx.auth.getUserOrFail()

    let result
    if (payload.password === undefined) {
      result = await this.profile.update(current, payload)
    } else {
      const [throttled, updated] = await authAttempts().penalize(
        throttleKey('password', current.id),
        () => this.profile.update(current, payload)
      )
      if (throttled) throw throttled
      result = updated
    }

    const { user, passwordChanged } = result
    // Other devices are logged out; this one stays.
    if (passwordChanged) refreshSessionVersion(ctx, user)

    return ctx.serialize(UserTransformer.transform(user))
  }
}
