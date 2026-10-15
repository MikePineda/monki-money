import { isDevMode } from '@angular/core'
import type { Routes } from '@angular/router'
import { KIT_ROUTES } from './kit/kit.routes'
import { AppShellComponent } from './layouts/app-shell/app-shell.component'

/**
 * Top-level routes. The shell (tab bar) wraps the main tabs; quick add is
 * full screen. Auth routes (auth-layout) and guards arrive with the session
 * package. `/__kit` is the ui-kit gallery, development builds only.
 */
export const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'month' },
      { path: 'month', loadComponent: () => import('./features/month/month.page') },
      {
        path: 'transactions',
        loadComponent: () => import('./features/transactions/transactions.page'),
      },
      { path: 'more', loadComponent: () => import('./features/more/more.page') },
    ],
  },
  { path: 'add', loadComponent: () => import('./features/add/add.page') },
  ...(isDevMode() ? KIT_ROUTES : []),
  { path: '**', redirectTo: 'month' },
]
