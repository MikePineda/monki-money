import type User from '#models/user'
import { FieldError } from '#exceptions/field_error'
import type { UpdateProfileInput } from '#services/auth/dto'

/**
 * The user's own settings. A password change needs the current password and
 * bumps session_version (the caller re-stamps its own session so only the
 * other devices are logged out).
 */
export default class ProfileService {
  async update(user: User, input: UpdateProfileInput) {
    let passwordChanged = false

    if (input.password !== undefined) {
      if (!input.currentPassword || !(await user.verifyPassword(input.currentPassword))) {
        throw new FieldError('currentPassword', 'matches')
      }
      user.password = input.password
      user.sessionVersion += 1
      passwordChanged = true
    }

    if (input.fullName !== undefined) user.fullName = input.fullName
    if (input.locale !== undefined) user.locale = input.locale
    if (input.theme !== undefined) user.theme = input.theme

    await user.save()
    return { user, passwordChanged }
  }

  /** "Log out everywhere": every session stamped with the old version dies. */
  async revokeAllSessions(user: User) {
    user.sessionVersion += 1
    await user.save()
  }
}
