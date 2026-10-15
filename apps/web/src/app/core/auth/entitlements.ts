import type { Entitlements, MemberRole } from '@monkimoney/shared'

/**
 * Pure rules about who may go where and do what. No Angular: the session
 * store feeds them its state, guards and screens read the answers. Flags and
 * plan limits always come from the API (`GET /auth/me`), never from here.
 */
export interface SessionSnapshot {
  authenticated: boolean
  verified: boolean
  hasHousehold: boolean
  pendingDeletion: boolean
  role: MemberRole | null
  flags: readonly string[]
}

/** The screen a person belongs on right now, given their session. */
export function homePath(session: SessionSnapshot): string {
  if (!session.authenticated) {
    return '/login'
  }
  if (!session.verified) {
    return '/verify-email'
  }
  if (!session.hasHousehold) {
    return '/household/new'
  }
  if (session.pendingDeletion) {
    return '/household-deleted'
  }
  return '/month'
}

export function hasFlag(flags: readonly string[], flag: string): boolean {
  return flags.includes(flag)
}

/** Owner only: rename, time zone, invitations, export, delete. */
export function canManageHousehold(role: MemberRole | null): boolean {
  return role === 'owner'
}

/** The owner invites while the plan still has a member seat free. */
export function canInvite(
  role: MemberRole | null,
  memberCount: number,
  entitlements: Entitlements | null
): boolean {
  if (!canManageHousehold(role)) {
    return false
  }
  return entitlements === null || memberCount < entitlements.maxMembers
}

export function canAddAccount(accountCount: number, entitlements: Entitlements | null): boolean {
  return entitlements === null || accountCount < entitlements.maxAccounts
}

const AUTH_SCREENS = /^\/(login|signup|forgot-password|reset-password)(?:[/?#]|$)/

/**
 * A `returnUrl` is only followed when it is a path inside this app: no
 * scheme, no protocol-relative `//host`, no backslash tricks, and never back
 * to an auth screen.
 */
export function safeReturnUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.includes('\\')) {
    return null
  }
  return AUTH_SCREENS.test(url) ? null : url
}
