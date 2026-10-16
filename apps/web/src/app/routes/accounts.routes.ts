import type { Routes } from '@angular/router'

/**
 * `/settings/accounts` and what hangs from one account (its payslips),
 * behind one lazy entry so the eager route table does not grow. Lives
 * outside features/ because it joins two features (settings, payslips).
 */
const ACCOUNTS_ROUTES: Routes = [
  { path: '', loadComponent: () => import('../features/settings/feature/accounts.page') },
  {
    path: ':accountId/payslips',
    loadChildren: () => import('../features/payslips/payslips.routes'),
  },
]

export default ACCOUNTS_ROUTES
