import type { Routes } from '@angular/router'
import MonthPage from './month.page'

/**
 * `/month` and `/month/:ym` (YYYY-MM): one lazy entry in the app routes and
 * one chunk with the page, so the eager bundle carries a single loader.
 */
export default [
  { path: '', component: MonthPage },
  { path: ':ym', component: MonthPage },
] satisfies Routes
