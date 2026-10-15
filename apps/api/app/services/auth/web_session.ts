import type User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Session key holding the `users.session_version` the session was created
 * with. The verify_session_version middleware compares it on every
 * authenticated request; bumping the column revokes every older session.
 */
export const SESSION_VERSION_KEY = 'sv'

/**
 * HTTP-layer helper (the only auth code that touches the context): logs the
 * user into the `web` guard (which regenerates the session id) and stamps
 * the session version. Used by login, sign-up and invitation accept.
 */
export async function startWebSession(ctx: Pick<HttpContext, 'auth' | 'session'>, user: User) {
  await ctx.auth.use('web').login(user)
  ctx.session.put(SESSION_VERSION_KEY, user.sessionVersion)
}

/** Keeps the current session valid after its user's session_version changed. */
export function refreshSessionVersion(ctx: Pick<HttpContext, 'session'>, user: User) {
  ctx.session.put(SESSION_VERSION_KEY, user.sessionVersion)
}
