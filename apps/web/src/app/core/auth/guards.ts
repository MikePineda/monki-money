import { inject } from '@angular/core'
import { Router, type CanActivateFn, type CanMatchFn } from '@angular/router'
import type { MemberRole } from '@monkimoney/shared'
import { ConfigStore } from './config.store'
import { OnboardingStatus } from './onboarding-status'
import { SessionStore } from './session.store'

/**
 * Route guards over the session (all functional). Each one answers `true`
 * or redirects to where the person belongs (`SessionStore.homePath`), so a
 * wrong turn never ends on a blank or forbidden screen.
 */

function goHome() {
  return inject(Router).parseUrl(inject(SessionStore).homePath())
}

/** The default landing: no point in remembering it as a return address. */
const LANDING_URLS = new Set(['', '/', '/month'])

/** Signed in; guests go to /login and come back afterwards (deep links survive). */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(SessionStore).isAuthenticated()) {
    return true
  }
  const returnUrl = LANDING_URLS.has(state.url) ? {} : { returnUrl: state.url }
  return inject(Router).createUrlTree(['/login'], { queryParams: returnUrl })
}

/** Signed out only (login, sign-up, password reset requests). */
export const guestGuard: CanActivateFn = () =>
  inject(SessionStore).isAuthenticated() ? goHome() : true

/** Email confirmed; otherwise the "check your inbox" screen. */
export const verifiedGuard: CanActivateFn = () =>
  inject(SessionStore).isVerified() ? true : inject(Router).parseUrl('/verify-email')

/** Part of an active household. */
export const householdGuard: CanActivateFn = () => {
  const session = inject(SessionStore)
  return session.hasHousehold() && !session.isPendingDeletion() ? true : goHome()
}

/** Signed in without a household (they can only join one through an invitation). */
export const noHouseholdGuard: CanActivateFn = () =>
  inject(SessionStore).hasHousehold() ? goHome() : true

/** The household is scheduled for deletion (the restore screen). */
export const pendingDeletionGuard: CanActivateFn = () =>
  inject(SessionStore).isPendingDeletion() ? true : goHome()

/** Only this household role (owner-only settings). */
export function roleGuard(role: MemberRole): CanActivateFn {
  return () => (inject(SessionStore).role() === role ? true : inject(Router).parseUrl('/settings'))
}

/** Only when the API switched this feature flag on for the household. */
export function flagGuard(flag: string): CanActivateFn {
  return () => (inject(SessionStore).hasFlag(flag) ? true : inject(Router).parseUrl('/month'))
}

/** Sign-up exists only while the API says registration is open. */
export const registrationOpenGuard: CanMatchFn = async () => {
  // inject() only works before the first await.
  const router = inject(Router)
  const config = await inject(ConfigStore).load()
  return config?.registrationOpen ? true : router.parseUrl('/login')
}

/** The app itself waits until the owner finished (or skipped through) onboarding. */
export const onboardedGuard: CanActivateFn = async () => {
  const router = inject(Router)
  return (await inject(OnboardingStatus).isPending()) ? router.parseUrl('/onboarding') : true
}

/** The wizard is only for an owner whose household still needs it. */
export const onboardingPendingGuard: CanActivateFn = async () => {
  const router = inject(Router)
  return (await inject(OnboardingStatus).isPending()) ? true : router.parseUrl('/month')
}
