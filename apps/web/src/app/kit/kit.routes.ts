import type { Routes } from '@angular/router'

/**
 * The ui-kit gallery, for development only. Production builds replace this
 * file with kit.routes.prod.ts (angular.json fileReplacements), so the
 * gallery is not even emitted as a lazy chunk there.
 */
export const KIT_ROUTES: Routes = [{ path: '__kit', loadComponent: () => import('./kit.page') }]
