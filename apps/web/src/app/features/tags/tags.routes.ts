import type { Routes } from '@angular/router'

/**
 * `/tags` (every tag with its totals) and `/tags/:tag` (one tag; the
 * router decodes the URL-encoded tag for the page's input). One lazy entry
 * in the app routes keeps the initial bundle as it was.
 */
export default [
  { path: '', loadComponent: () => import('./feature/tags-list.page') },
  { path: ':tag', loadComponent: () => import('./feature/tag-detail.page') },
] satisfies Routes
