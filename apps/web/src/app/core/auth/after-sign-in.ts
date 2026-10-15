import { safeReturnUrl } from './entitlements'
import { readPendingInvite } from './pending-invite'

/**
 * Where to go right after logging in or creating an account: back to a
 * pending invitation first, then to the page that asked for the login, then
 * wherever the session belongs.
 */
export function afterSignInUrl(view: Window, returnUrl: string | null, home: string): string {
  const invite = readPendingInvite(view)
  if (invite) {
    return `/invite/${encodeURIComponent(invite)}`
  }
  return safeReturnUrl(returnUrl) ?? home
}
