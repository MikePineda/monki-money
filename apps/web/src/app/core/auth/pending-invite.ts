/**
 * An invitation link opened while signed out: the token waits in
 * sessionStorage (this tab only, gone when it closes) until the person logs
 * in or creates their account, then the invite screen picks it up again.
 */
export const PENDING_INVITE_KEY = 'mm:invite'

export function savePendingInvite(view: Window, token: string): void {
  try {
    view.sessionStorage.setItem(PENDING_INVITE_KEY, token)
  } catch {
    // Storage blocked: the person can open the link again.
  }
}

export function readPendingInvite(view: Window): string | null {
  try {
    return view.sessionStorage.getItem(PENDING_INVITE_KEY)
  } catch {
    return null
  }
}

export function clearPendingInvite(view: Window): void {
  try {
    view.sessionStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    // Nothing stored.
  }
}
