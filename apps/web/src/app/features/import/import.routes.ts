import type { Routes } from '@angular/router'

/** `/import`: upload, `/import/:id`: review, `/import/:id/result`: what confirm did. */
const IMPORT_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./feature/upload.page') },
  { path: ':id', loadComponent: () => import('./feature/review.page') },
  { path: ':id/result', loadComponent: () => import('./feature/result.page') },
]

export default IMPORT_ROUTES
