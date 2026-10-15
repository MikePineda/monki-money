import type { Routes } from '@angular/router'
import { isDevMode } from '@angular/core'
import {
  authGuard,
  flagGuard,
  guestGuard,
  householdGuard,
  noHouseholdGuard,
  onboardedGuard,
  onboardingPendingGuard,
  pendingDeletionGuard,
  registrationOpenGuard,
  verifiedGuard,
} from './core/auth/guards'
import { KIT_ROUTES } from './kit/kit.routes'

/** Signed in, email confirmed, in an active household that finished onboarding. */
const inTheApp = [authGuard, verifiedGuard, householdGuard, onboardedGuard]

/**
 * Top-level routes.
 * - The shell (tab bar) wraps the main tabs and settings. It comes first so
 *   `/` redirects to `/month` (an empty-path layout with children would
 *   otherwise match `/` with an empty outlet).
 * - Onboarding and quick add are full screen.
 * - The auth layout frames everything outside the app proper: login,
 *   sign-up, verification, password reset, invitations, the "no household"
 *   and "scheduled for deletion" states, and the legal texts.
 * `/__kit` is the ui-kit gallery, development builds only.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layouts/app-shell/app-shell.component').then((m) => m.AppShellComponent),
    canActivate: inTheApp,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'month' },
      { path: 'month', loadComponent: () => import('./features/month/month.page') },
      { path: 'month/:ym', loadComponent: () => import('./features/month/month.page') },
      {
        path: 'transactions',
        loadComponent: () => import('./features/transactions/transactions.page'),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/feature/settings.page'),
      },
      {
        path: 'settings/password',
        loadComponent: () => import('./features/settings/feature/password.page'),
      },
      {
        path: 'settings/accounts',
        loadComponent: () => import('./features/settings/feature/accounts.page'),
      },
      {
        path: 'upgrade',
        canActivate: [flagGuard('billing')],
        loadComponent: () => import('./features/settings/feature/upgrade.page'),
      },
      { path: 'more', redirectTo: 'settings' },
    ],
  },
  {
    path: 'onboarding',
    canActivate: [authGuard, verifiedGuard, householdGuard, onboardingPendingGuard],
    loadComponent: () => import('./features/onboarding/feature/onboarding.page'),
  },
  {
    path: 'add',
    canActivate: inTheApp,
    loadComponent: () => import('./features/quick-add/quick-add.page'),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layouts/auth-layout/auth-layout.component').then((m) => m.AuthLayoutComponent),
    children: [
      {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/feature/login.page'),
      },
      {
        path: 'signup',
        canMatch: [registrationOpenGuard],
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/feature/signup.page'),
      },
      {
        path: 'forgot-password',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/feature/forgot-password.page'),
      },
      {
        path: 'reset-password/:token',
        loadComponent: () => import('./features/auth/feature/reset-password.page'),
      },
      {
        path: 'verify-email',
        loadComponent: () => import('./features/auth/feature/verify-email.page'),
      },
      {
        path: 'invite/:token',
        loadComponent: () => import('./features/auth/feature/invite.page'),
      },
      {
        path: 'no-household',
        canActivate: [authGuard, verifiedGuard, noHouseholdGuard],
        loadComponent: () => import('./features/auth/feature/no-household.page'),
      },
      {
        path: 'household-deleted',
        canActivate: [authGuard, verifiedGuard, pendingDeletionGuard],
        loadComponent: () => import('./features/auth/feature/household-deleted.page'),
      },
      {
        path: 'legal/terms',
        data: { document: 'terms' },
        loadComponent: () => import('./features/legal/legal.page'),
      },
      {
        path: 'legal/privacy',
        data: { document: 'privacy' },
        loadComponent: () => import('./features/legal/legal.page'),
      },
    ],
  },
  ...(isDevMode() ? KIT_ROUTES : []),
  { path: '**', redirectTo: 'month' },
]
