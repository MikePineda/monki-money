import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { updateProfileValidator } from '#validators/auth'
import ProfileService from '#services/auth/profile_service'
import UserTransformer from '#transformers/user_transformer'
import { refreshSessionVersion } from '#services/auth/web_session'

@inject()
export default class ProfileController {
  constructor(protected profile: ProfileService) {}

  /** PATCH /me: name, language, theme and password (with the current one). */
  async update(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updateProfileValidator)

    const { user, passwordChanged } = await this.profile.update(ctx.auth.getUserOrFail(), payload)
    // Other devices are logged out; this one stays.
    if (passwordChanged) refreshSessionVersion(ctx, user)

    return ctx.serialize(UserTransformer.transform(user))
  }
}
