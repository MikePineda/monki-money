# Backlog

Ideas captured mid-session: one dated line each, newest at the bottom.
Strategy and phases live in the plan; this is the inbox.

- 2026-10-15 Private transactions between partners (`transactions.is_private`): the other member sees the amount in household totals but not merchant/note/category. Phase 2.
- 2026-10-15 Backfill eight months of NAB history on day one (`node ace import:nab`, WP 3.5): raise its priority right after import lands.
- 2026-10-15 Web Push on iOS works for installed PWAs since 16.4: "did you log anything today?" and "your monthly summary is ready" reminders (P2).
- 2026-10-15 Recurring payments and "already committed this month" (rent, phone, gym) detected from merchant rules + periodicity (P2; also affects envelopes in P3).
- 2026-10-15 Bank feeds for the SaaS (Australian CDR via aggregators such as Basiq or Frollo): design constraint only, the `BankCsvParser` strategy already allows a `source='feed'`.
- 2026-10-15 Balances between the two partners (Splitwise style) from `paid_by_user_id`; decide later whether to show it.
- 2026-10-15 Free-form tags on transactions (jsonb), e.g. a trip tag to see a holiday's total cost (P2).
- 2026-10-15 Receipts by email (Resend inbound or Cloudflare Email Routing -> webhook) feeding the receipt scanner review list (P3).
- 2026-10-15 Siri / Apple Shortcuts quick add through a personal-token endpoint (P3).
- 2026-10-15 SaaS in Australia: own domain, Privacy Act (APPs) policy and retention, data residency (APAC), full `audit_log`, private analytics only if needed.
- 2026-10-15 Real data never in the repo or in agents' context: synthetic fixtures with the real structure; real CSVs only in Downloads and the private bucket.
- 2026-10-15 Show/hide toggle on password fields (the login mock has the eye icon); a ui-kit text-field option.
- 2026-10-15 Type `GET /auth/me` with its `{ data }` wrapper in the registry (the web reads it through `unwrapData`).
- 2026-10-15 Charts: opt-in texture fill (45/135 degrees) for forced-colors, print and full CVD (dataviz backup channel); today legends, direct labels and table views carry identity.
- 2026-10-15 `applyToFuture` on `PATCH /transactions/:id` and `applyRuleToFuture` on bulk categorize (learn a merchant rule) land with `merchant_rules` in WP 3.3; the ledger endpoints do not accept them yet.
- 2026-10-15 Tag filter for `GET /transactions` (`tag=`) and per-tag totals in reports (the column exists since WP 2.1).
- 2026-10-15 Month strip: tapping the selected month should open the year-grid sheet (DESIGN.md, Month picker); the picker emits `yearGrid`, no sheet listens yet.
- 2026-10-15 `reports.month` could carry the previous month's totals and the top expenses, saving the Month view its `reports.trend` dependency for the delta and a `transactions.index` call.
- 2026-10-15 Quick add ranks categories, payees and transfer routes from the last 100 rows on the client; a `GET /transactions/suggestions` (per person) would scale past that window and give the "last account used" without reading the ledger.
- 2026-10-15 The members (and the partner's display name) could come with `GET /auth/me`, so screens that only need names skip `GET /household/members`.
- 2026-10-15 `GET /transfers/:id` (both legs and the memo in one call): the transaction sheet finds the other leg through `GET /transactions?kind=transfer&from=&to=` today.
- 2026-10-15 "Joint only" filter for `GET /transactions` (`paidByUserId` cannot ask for null); the person chip offers everyone, you and the partner.
- 2026-10-15 Tab bar: mark "More" active on screens reached from it outside `/settings` (`/categories`); `TabItem` needs extra match prefixes.
- 2026-10-15 Move `TransactionForm`/`TransferForm` to `shared/` (or host quick add under `features/transactions`) so the add page can reuse them without a cross-feature import.
- 2026-10-16 Insights: run the monthly cron (`0 8 1 * *` Brisbane) once a worker exists, and let dev opt into the fake LLM for insights (today only the test suite may; dev answers 503 without a key).
- 2026-10-16 `test_reset_wipes_the_database_and_seeds_the_e2e_household` fails when its file runs alone: `RESTART IDENTITY` gives the new E2E household the leftover's id 1 (passes in the full suite).
- 2026-10-16 After a member leaves, `accounts.owner_user_id` and `account_cards.user_id` still point at them, so `defaultPayer` gives new rows on those accounts/cards to the ex-member: decide whether leaving makes their accounts joint or the default payer skips non-members.
- 2026-10-16 Household ownership transfer (owners can only delete today, `household.leave` answers 422 for them), and letting a member leave while the household is pending deletion (today 403 like every household route).
- 2026-10-16 `GET /goals` could carry each goal's projection (`?include=projection`): the goals list reads `GET /goals/:id/projection` once per goal today.
- 2026-10-16 Goal projections have no history: the chart's solid "actual" line is today's point only. A tracked account's month-end balances (or the household's monthly net) would give it real months.
- 2026-10-16 Goals never change status by themselves: when `remainingCents` reaches 0 the detail could offer "Mark as reached" more prominently (or a push "you reached {goal}"), and show `reachedAt` ("Reached on 3 Nov").
- 2026-10-16 The Month summary card asks `GET /insights/:month` on every month it shows (404 until generated); a flag on the month report (or `GET /insights?from=&to=`) would save the call.
- 2026-10-16 The web initial bundle is ~350.3 kB, past its 350 kB warning budget already on main before WP 5.2 (the goals routes add ~0.2 kB): trim the eager app or raise the budget.
- 2026-10-16 Vitest's module cache (`node_modules/.vitest-cache`) served a stale component when a spec file's text matched an earlier run (a fixed template still failed until the spec changed); delete the folder when a spec result makes no sense, or disable the cache.
