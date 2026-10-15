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
- 2026-10-15 Email verification by 6-digit code as well as the link (on iOS the link opens Safari, not the installed PWA); needs an API endpoint.
- 2026-10-15 "Leave household" for members and "create a household" for a user left without one: no API route yet, the settings screen omits leave.
- 2026-10-15 Show/hide toggle on password fields (the login mock has the eye icon); a ui-kit text-field option.
- 2026-10-15 Type `GET /auth/me` with its `{ data }` wrapper in the registry (the web reads it through `unwrapData`).
- 2026-10-15 Charts: opt-in texture fill (45/135 degrees) for forced-colors, print and full CVD (dataviz backup channel); today legends, direct labels and table views carry identity.
- 2026-10-15 `applyToFuture` on `PATCH /transactions/:id` and `applyRuleToFuture` on bulk categorize (learn a merchant rule) land with `merchant_rules` in WP 3.3; the ledger endpoints do not accept them yet.
- 2026-10-15 Tag filter for `GET /transactions` (`tag=`) and per-tag totals in reports (the column exists since WP 2.1).
- 2026-10-15 `GET /transfers/:id` (both legs and the memo in one call): the transaction sheet finds the other leg through `GET /transactions?kind=transfer&from=&to=` today.
- 2026-10-15 "Joint only" filter for `GET /transactions` (`paidByUserId` cannot ask for null); the person chip offers everyone, you and the partner.
- 2026-10-15 Tab bar: mark "More" active on screens reached from it outside `/settings` (`/categories`); `TabItem` needs extra match prefixes.
- 2026-10-15 Move `TransactionForm`/`TransferForm` to `shared/` (or host quick add under `features/transactions`) so the add page can reuse them without a cross-feature import.
- 2026-10-16 Insights: run the monthly cron (`0 8 1 * *` Brisbane) once a worker exists, and let dev opt into the fake LLM for insights (today only the test suite may; dev answers 503 without a key).
- 2026-10-16 `test_reset_wipes_the_database_and_seeds_the_e2e_household` fails when its file runs alone: `RESTART IDENTITY` gives the new E2E household the leftover's id 1 (passes in the full suite).
