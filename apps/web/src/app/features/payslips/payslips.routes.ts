import type { Routes } from '@angular/router'

/**
 * `/settings/accounts/:accountId/payslips`: the account's payslips, and
 * `/new`: record one. Both read `accountId` from the parent route.
 */
const PAYSLIPS_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./feature/payslips.page') },
  { path: 'new', loadComponent: () => import('./feature/payslip-new.page') },
]

export default PAYSLIPS_ROUTES
