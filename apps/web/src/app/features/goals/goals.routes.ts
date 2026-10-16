import type { Routes } from '@angular/router'

/**
 * `/goals` (the list), `/goals/new` and `/goals/:id`: one lazy entry in the
 * app routes instead of three keeps the initial bundle small.
 */
export default [
  { path: '', loadComponent: () => import('./feature/goals-list.page') },
  { path: 'new', loadComponent: () => import('./feature/goal-new.page') },
  { path: ':id', loadComponent: () => import('./feature/goal-detail.page') },
] satisfies Routes
