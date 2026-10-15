import User from '#models/user'
import { DateTime } from 'luxon'
import { authAttempts, throttleKey } from '#services/auth/throttles'

/**
 * Credential check with throttling: only failures count (`penalize`), 5 per
 * minute per IP + email, then a 20-minute block. Unknown emails and wrong
 * passwords fail the same way (and take the same time).
 */
export default class LoginService {
  async attempt(email: string, password: string, ip: string): Promise<User> {
    const [throttled, user] = await authAttempts().penalize(throttleKey('login', ip, email), () =>
      User.verifyCredentials(email, password)
    )
    if (throttled) throw throttled

    user.lastLoginAt = DateTime.now()
    await user.save()
    return user
  }
}
