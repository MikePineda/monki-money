# API contract

The contract between `apps/api` and `apps/web` is the **Tuyau registry**
generated from the API routes (`apps/api/.adonisjs/client/registry`), plus the
types in `@monkimoney/shared`. There is no hand-written OpenAPI file and no
mock server.

## How it works

1. Every route has a name (`.as('group.resource.action')`) and a controller
   whose return type is the response body.
2. `npm run codegen` regenerates `apps/api/.adonisjs` (also done by
   `node ace build` and `node ace serve`). The folder is committed.
3. The web app imports the registry through tsconfig `paths`
   (`@monkimoney/api/registry`, `@monkimoney/api/data`) and creates the client
   in `apps/web/src/app/core/api.ts`.
4. Change a route or a response shape, run `npm run codegen`, and
   `npm run typecheck` fails in the web app wherever the old shape was used.
   CI runs codegen and fails on any diff in `apps/api/.adonisjs`.

The SPA fallback route (`spa.fallback`) is excluded from the registry
(`adonisrc.ts`).

## Conventions

- Business endpoints live under `/api/v1`; probes (`/api/health*`) do not.
- Success bodies are `{ data }`; paginated lists are `{ data, metadata }`
  with `perPage <= 100`.
- Validation errors: 422 `{ errors: [{ field, rule, message }] }`, localized.
  Service-level checks use the same shape (e.g. `email`/`alreadyMember`,
  `externalAccountNumber`/`taken`, a foreign id in the body →
  `<field>`/`database.exists`).
- Other 4xx: `{ message, code }` with the message translated
  (`resources/lang/<locale>/errors.json`), e.g. 404 `E_ROW_NOT_FOUND`,
  403 `E_EMAIL_NOT_VERIFIED` / `E_NO_HOUSEHOLD` / `E_HOUSEHOLD_PENDING_DELETION`
  / `E_HOUSEHOLD_SUSPENDED` / `E_BAD_CSRF_TOKEN` / `E_TRANSACTION_PRIVATE` (a
  partner's private transaction), 402 `E_MEMBER_LIMIT_REACHED`
  / `E_ACCOUNT_LIMIT_REACHED` / `E_LLM_QUOTA_EXCEEDED` (plan limits,
  `config/plans.ts`), 409
  `E_ACCOUNT_IN_USE` / `E_CATEGORY_IN_USE` / `E_GROUP_NOT_EMPTY` /
  `E_ALREADY_IN_HOUSEHOLD` / `E_TRANSFER_LEG` (edit the transfer, not its leg) /
  `E_PAYSLIP_LINE` (a payslip row's amount, kind, account, date or existence) /
  `E_CONFLICT` (a unique-constraint race; a foreign-key race answers
  `E_CATEGORY_IN_USE` / `E_ACCOUNT_IN_USE` when the delete lost it) /
  `E_CONCURRENT_UPDATE` (a deadlock or serialization failure: nothing was
  written, retry), 410
  `E_INVITATION_EXPIRED`, 400 `E_INVALID_TOKEN`, 422 `E_OWNER_CANNOT_LEAVE`. Bank imports add 422 `E_CSV_*`
  (`E_CSV_TOO_LARGE`, `E_CSV_TOO_MANY_ROWS`, `E_CSV_ENCODING`, `E_CSV_UNKNOWN_FORMAT`,
  `E_CSV_MALFORMED`, `E_CSV_INVALID_VALUE`, `E_CSV_EMPTY`; with `line` / `column`
  when known), 422 `E_IMPORT_UNKNOWN_ACCOUNTS` (`accountNumbers[]` to map),
  422 `E_IMPORT_ROWS_UNDECIDED` (`rowIds[]`), 409 `E_IMPORT_BATCH_OPEN`
  (`batchId`, `accountId`), 409 `E_IMPORT_BATCH_CLOSED`, 402
  `E_IMPORT_LIMIT_REACHED` and `E_LLM_QUOTA_EXCEEDED`; the fields in parentheses
  come next to `message` and `code`. Auth, throttle and role failures keep the framework
  shape `{ errors: [{ message }] }`: 400 bad credentials, 401 not logged in
  (or revoked session), 403 role (`HouseholdPolicy`), 429 throttled (with
  `Retry-After`).
- 5xx in production: a generic translated `{ message, code: 'E_INTERNAL_SERVER_ERROR' }`
  (driver, table and constraint names stay in the logs), except 503
  `E_INSIGHTS_UNAVAILABLE` (no LLM configured), `E_LLM_UNAVAILABLE` (the
  LLM vendor failed, or receipt scanning without a configured LLM) and
  `E_STORAGE_UNAVAILABLE` (no bucket, or it did not answer), which keep their
  translated `{ message, code }` in every environment ("try again later").
- Unknown routes: JSON 404 (`{ message, code }`), including any `/api/*` GET
  that would otherwise hit the SPA fallback.
- Amounts are integer cents named `*Cents`; dates are `YYYY-MM-DD` (years
  1900-2999, months `YYYY-MM` likewise; ids fit a Postgres `integer`, anything
  else is a 422); timestamps are ISO-8601 UTC strings. People send amounts positive
  (`amountCents > 0`) with a `kind`; the ledger returns them signed
  (expenses and outgoing transfer legs negative). Report amounts are
  positive on their own side (`expenseCents` = spent, net of refunds).
- Idempotent creates: `POST /transactions[/quick]` and `POST /transfers`
  accept a client-generated `clientId` (uuid). The first request answers
  201; a retry with the same key answers 200 with the row it created
  (unique per household, also under a race).
- Private transactions (`isPrivate`): only the payer (or, for a joint one,
  its creator; nobody once that owner is deleted or leaves the household,
  when the row becomes ordinary) sees `payee`, `description`, `rawDescription`, `tags`,
  `categoryId` and the split lines; the partner gets them empty with
  `isMasked: true` (and `needsReview: false`), never matches them in
  searches, category or review filters, sees the amount under the `private`
  bucket in reports, cannot change the row (403 `E_TRANSACTION_PRIVATE`) and
  bulk categorize skips it.
- Another household's resource: 404, never 403.
- Locale of messages: the user's `locale`, else `Accept-Language`, else the
  household's, else `APP_DEFAULT_LOCALE` (`en`). Responses carry
  `Content-Language`. System categories/groups (`isSystem`) are named in that
  locale; custom (or renamed) ones keep the typed name.

## Session and CSRF

Cookie session (`monkimoney_session`, httpOnly, `secure` in production,
`SameSite=Lax`, 30 days). Every request sets the `XSRF-TOKEN` cookie; every
POST/PUT/PATCH/DELETE must send it back as `X-XSRF-TOKEN` (Tuyau does it).
SPA boot: `GET /api/v1/auth/me` (401 for guests, but the cookie is set), then
`POST /api/v1/auth/login`. Login, logout-all, password change and password
reset bump `users.session_version`; sessions stamped with an older version
answer 401.

Middleware per group: public auth routes (throttled per IP, plus email where
there is one); _authenticated_ (`auth`, session version, 300 req/min per user:
`auth.me`, `auth.logout*`, `auth.email.resend`, `auth.email.verifyCode`,
`me.update`); _verified_ (authenticated + verified email, no household needed:
`households.store`); _household_
(authenticated, verified email and household context: everything under
`/household`, `/accounts`, `/category-groups`, `/categories`, `/transactions`,
`/transfers`, `/payslips`, `/reports`, `/goals`, `/insights`).
`household.restore` is the only household route allowed while the household
is pending deletion.

Throttles (429): login, sign-up, forgot/reset password and invitation
lookups/accepts 5/min (then 20 min blocked) per client IP (+ email); password
re-checks (`PATCH /me` with `password`, `household.delete`) 5/min per user;
`auth.email.resend` 3 per 15 min per user; wrong `auth.email.verifyCode`
codes 5/min (then 20 min blocked) per client IP + email; invitation mails (create + resend)
10/hour per household. The client IP is `CF-Connecting-IP` only when the
request came through the local proxy (see `docs/RUNBOOK.md`).

### Bot protection (Cloudflare Turnstile)

Off while `TURNSTILE_SECRET` is empty (the body field is ignored). With a
secret, `auth.signup`, `auth.login` and `auth.password.forgot` require
`turnstileToken` (the widget token; the site key comes from `GET /config`)
and check it with Cloudflare's siteverify (client IP from `clientIp(ctx)`,
5 s timeout, fails closed) before validation, credentials and throttles: a
missing or rejected token answers 422 `{ field: 'turnstileToken', rule:
'turnstile' }` and never counts toward the login/sign-up/forgot limits.
Enabling it: `docs/RUNBOOK.md` ("Turnstile").

Test-only (exist only with `NODE_ENV=test` or `E2E_MODE=true`, CSRF-exempt,
not in the registry): `POST /api/test/reset` (wipe the database, throttles and
outbox; seed the E2E household) and `GET /api/test/outbox` (mails the `log`
transport "sent" since the last reset, newest last, at most 50:
`{ data: [{ to, subject, links, codes, sentAt }] }`, `codes` = the 6-digit
verification codes in the body).

## Endpoints today

All business routes are under `/api/v1`. "Owner" = `HouseholdPolicy` (403 for
members). Bodies in `{ data }` unless noted.

| Name                                                          | Method and path                                                                                | Notes                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health.ready`                                                | `GET /api/health`                                                                              | `HealthReport` (`@monkimoney/shared`), 200 or 503                                                                                                                                                                                                                                                                                                          |
| `health.live`                                                 | `GET /api/health/live`                                                                         | `{ status: 'ok' }`                                                                                                                                                                                                                                                                                                                                         |
| `config.show`                                                 | `GET /config`                                                                                  | `PublicConfig`: `registrationOpen`, `version`, `turnstileSiteKey`, `sentryDsnWeb`, `defaultLocale`                                                                                                                                                                                                                                                         |
| `auth.signup`                                                 | `POST /auth/signup`                                                                            | `{ fullName, email, password (10+), locale?, householdName?, turnstileToken? }` → 201 `{ user, household }`, logs in, sends the verification mail. 403 `E_REGISTRATION_CLOSED` (before any validation) when `REGISTRATION_OPEN=false`; 5 attempts/min per IP                                                                                               |
| `auth.login`                                                  | `POST /auth/login`                                                                             | `{ email, password, turnstileToken? }` → `{ user, household \| null }`. 5 failures/min per IP + email, then 20 min blocked (429)                                                                                                                                                                                                                           |
| `auth.me`                                                     | `GET /auth/me`                                                                                 | `{ user, household, membership, entitlements, flags }` (household/membership/entitlements null without a household)                                                                                                                                                                                                                                        |
| `auth.logout`                                                 | `POST /auth/logout`                                                                            | 204, this session only                                                                                                                                                                                                                                                                                                                                     |
| `auth.logout_all`                                             | `POST /auth/logout-all`                                                                        | 204, bumps `session_version` (every device)                                                                                                                                                                                                                                                                                                                |
| `auth.email.verify`                                           | `POST /auth/email/verify`                                                                      | Public `{ token }` (from `/verify-email?token=`) → `{ emailVerifiedAt }`; 400 `E_INVALID_TOKEN`                                                                                                                                                                                                                                                            |
| `auth.email.resend`                                           | `POST /auth/email/resend`                                                                      | 202, a new link and a new 6-digit code (the previous code stops working); no-op once verified; 3 per 15 min per user                                                                                                                                                                                                                                       |
| `auth.email.verifyCode`                                       | `POST /auth/email/verify-code`                                                                 | Logged in. `{ code }` (6 digits from the verification mail, 15 min) → `{ verified: true }`, also when already verified. 422 `code` with rule `verificationCode.invalid` (wrong), `.expired` (expired or none pending) or `.locked` (5 wrong attempts: resend for a new one); wrong codes 5/min per IP + email                                              |
| `auth.password.forgot`                                        | `POST /auth/password/forgot`                                                                   | `{ email, turnstileToken? }` → always 200 `{ requested: true }`; 5/min per IP + email                                                                                                                                                                                                                                                                      |
| `auth.password.reset`                                         | `POST /auth/password/reset`                                                                    | `{ token, password }` (from `/reset-password/:token`, 1 h, single use) → `{ reset: true }`; revokes every session                                                                                                                                                                                                                                          |
| `auth.invitations.show`                                       | `GET /auth/invitations/:token`                                                                 | Public: `{ email, role, householdName, inviterName, expiresAt }` (never whether the address has an account); 404 unknown, 410 expired/used/household not active                                                                                                                                                                                            |
| `auth.invitations.accept`                                     | `POST /auth/invitations/:token/accept`                                                         | `{ fullName?, password? }`: new account (verified because the token was emailed to that address; ignores `REGISTRATION_OPEN`) or existing one (its password: 422 `password`/`required` or `matches`) → `{ user, household }`, logs in. 409 if the user already has a household, 402 if the household is full, 410 expired/used/household not active        |
| `me.update`                                                   | `PATCH /me`                                                                                    | `{ fullName?, locale?, theme?, password? + currentPassword }` → `User`; a password change logs out the other devices                                                                                                                                                                                                                                       |
| `household.show`                                              | `GET /household`                                                                               | `Household`                                                                                                                                                                                                                                                                                                                                                |
| `household.update`                                            | `PATCH /household`                                                                             | Owner. `{ name?, locale?, timezone? }`                                                                                                                                                                                                                                                                                                                     |
| `household.members`                                           | `GET /household/members`                                                                       | `Member[]` (`userId`, `fullName`, `email`, `role`, ...)                                                                                                                                                                                                                                                                                                    |
| `household.export`                                            | `GET /household/export?format=json\|csv`                                                       | Owner. Streamed download. JSON: household, members, accounts with cards, category groups, categories, transfers, transactions with split lines. CSV: the ledger, one row per posting (split lines expanded), names in the reader's locale, UTF-8 BOM, text cells starting with `= + - @` (or tab/CR) prefixed with `'`. Private rows of the partner masked |
| `household.delete`                                            | `POST /household/delete`                                                                       | Owner. `{ password }` → `Household` with `status: 'pending_deletion'`, `deletionScheduledAt` (+30 days)                                                                                                                                                                                                                                                    |
| `household.leave`                                             | `POST /household/leave`                                                                        | Members only (owners: 422 `E_OWNER_CANNOT_LEAVE`). 204; drops the membership and the current household, keeps the session (next household request: 403 `E_NO_HOUSEHOLD`) and the leaver's ledger rows (payer, creator, account owner, card user)                                                                                                           |
| `household.restore`                                           | `POST /household/restore`                                                                      | Owner, within the window. 409 if not pending, 410 if the window ended                                                                                                                                                                                                                                                                                      |
| `households.store`                                            | `POST /households`                                                                             | Verified, no household needed. `{ name, locale?, timezone?, currencyCode? }` (defaults: the user's locale, `Australia/Brisbane`, `AUD`) → 201 `{ household, membership }` (owner, taxonomy in that locale, becomes the current household); 409 `E_ALREADY_IN_HOUSEHOLD` when the user already has one                                                      |
| `household.invitations.index`                                 | `GET /household/invitations`                                                                   | Owner. Pending invitations                                                                                                                                                                                                                                                                                                                                 |
| `household.invitations.store`                                 | `POST /household/invitations`                                                                  | Owner. `{ email, role? }` → 201 invitation (`id`, `email`, `role`, `expiresAt`, never the link: it is only emailed), 7 days. 402 when the household is full; 10 mails/hour per household                                                                                                                                                                   |
| `household.invitations.destroy`                               | `DELETE /household/invitations/:id`                                                            | Owner. 204                                                                                                                                                                                                                                                                                                                                                 |
| `household.invitations.resend`                                | `POST /household/invitations/:id/resend`                                                       | Owner. New link by email (the old one stops working), fresh 7 days                                                                                                                                                                                                                                                                                         |
| `accounts.index`                                              | `GET /accounts`                                                                                | `Account[]` with `cards`, `clearedBalanceCents` (opening + cleared rows), `availableBalanceCents` (opening + every row, pending included). The opening balance is the balance at the end of `openingBalanceDate`: with a date, only rows dated after it count                                                                                              |
| `accounts.store`                                              | `POST /accounts`                                                                               | `{ name, kind, institution?, ownerUserId? (null = joint), currencyCode?, externalAccountNumber? (unique per household), openingBalanceCents?, openingBalanceDate?, isActive? }` → 201 ; 402 `E_ACCOUNT_LIMIT_REACHED` past the plan limit                                                                                                                  |
| `accounts.show` / `accounts.update`                           | `GET` / `PATCH /accounts/:id`                                                                  | Same fields, all optional on PATCH                                                                                                                                                                                                                                                                                                                         |
| `accounts.destroy`                                            | `DELETE /accounts/:id`                                                                         | 204; 409 `E_ACCOUNT_IN_USE` once it has transactions or a savings goal uses it                                                                                                                                                                                                                                                                             |
| `accounts.reorder`                                            | `PUT /accounts/reorder`                                                                        | `{ ids }` → 204 (`sortOrder` = position)                                                                                                                                                                                                                                                                                                                   |
| `accounts.cards.store`                                        | `POST /accounts/:id/cards`                                                                     | `{ cardSuffix, userId?, label? }` → 201                                                                                                                                                                                                                                                                                                                    |
| `accounts.cards.destroy`                                      | `DELETE /accounts/:id/cards/:cardId`                                                           | 204                                                                                                                                                                                                                                                                                                                                                        |
| `category_groups.index`                                       | `GET /category-groups`                                                                         | `CategoryGroup[]`                                                                                                                                                                                                                                                                                                                                          |
| `category_groups.store` / `.update` / `.destroy` / `.reorder` | `POST /category-groups`, `PATCH`/`DELETE /category-groups/:id`, `PUT /category-groups/reorder` | `{ name, kind? }`, `{ name?, isHidden? }`; delete 409 `E_GROUP_NOT_EMPTY`                                                                                                                                                                                                                                                                                  |
| `categories.index`                                            | `GET /categories[?tree=1]`                                                                     | `Category[]`, or groups with `categories` nested                                                                                                                                                                                                                                                                                                           |
| `categories.store` / `.update`                                | `POST /categories`, `PATCH /categories/:id`                                                    | `{ categoryGroupId, name, icon?, isHidden? }`; renaming a system category makes it custom; slug never changes                                                                                                                                                                                                                                              |
| `categories.destroy`                                          | `DELETE /categories/:id`                                                                       | `{ reassignToCategoryId? }` → 204 (transactions and split lines move to the replacement); 409 `E_CATEGORY_IN_USE` when referenced without a replacement                                                                                                                                                                                                    |
| `categories.reorder`                                          | `PUT /categories/reorder`                                                                      | `{ ids }` → 204                                                                                                                                                                                                                                                                                                                                            |

### Ledger and reports

`Transaction` = `{ id, accountId, kind (expense|income|transfer), date, bankDate,
amountCents (signed), currencyCode, payee, description, rawDescription,
categoryId, isSplit, splits[{ id, categoryId, amountCents, memo, sortOrder }],
transferId, paidByUserId (null = joint), status (pending|cleared), source
(manual|import|receipt|telegram), needsReview, cardSuffix, clientId, isPrivate,
isMasked, tags[], createdByUserId, updatedByUserId, createdAt, updatedAt }`.

| Name                          | Method and path                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transactions.index`          | `GET /transactions`                  | Paginated `{ data: Transaction[], metadata }`. Filters: `month=YYYY-MM` (wins over `from`/`to`), `from`, `to`, `accountId[]`, `categoryId[]` (also matches split lines), `uncategorized`, `paidByUserId`, `kind`, `status`, `needsReview`, `q` (payee, notes, bank text; wildcards literal), `page`, `perPage` (≤ 100, default 50), `sort` (`-date` default, `date`, `amount`, `-amount`)                                                                                                                                                                                                         |
| `transactions.store`          | `POST /transactions`                 | `{ clientId?, accountId, kind: expense\|income, date, amountCents > 0, categoryId? \| splits?[{ categoryId, amountCents, memo? }] (≥ 2 lines, same direction as the parent unless negative, sum = amount: 422 `splits`/`sumMismatch`), payee?, description?, paidByUserId? (null = joint; omitted = account owner → card → creator), status?, isPrivate?, tags?, source? (`manual`default \|`receipt` for a scanned draft; anything else 422) }` → 201 (200 on a `clientId` replay)                                                                                                               |
| `transactions.quick`          | `POST /transactions/quick`           | Same body; only `amountCents` is required. Defaults: the account this person used last (else the first active one; none → 422 `accountId`/`required`), today in the household time zone, `kind: expense`, no category                                                                                                                                                                                                                                                                                                                                                                             |
| `transactions.show`           | `GET /transactions/:id`              | `Transaction` (masked for the partner when private)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `transactions.update`         | `PATCH /transactions/:id`            | `{ accountId?, kind?, date?, amountCents?, categoryId?, payee?, description?, paidByUserId?, status?, isPrivate?, tags?, needsReview?, applyToFuture? }`. Setting a category clears `needsReview`; with `applyToFuture: true` the new category also becomes the merchant rule of the bank row the transaction came from (learned `merchant` rule; nothing for rows typed by hand); a new account brings its `currencyCode`. Split rows: amount changes → 422 `amountCents`/`splitSum`, a category → 422 `categoryId`/`split`, a kind change flips the lines. Transfer legs → 409 `E_TRANSFER_LEG` |
| `transactions.destroy`        | `DELETE /transactions/:id`           | 204 (split lines go with it; an imported row stays `ignored` in its import, so re-importing never brings it back); transfer legs → 409                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `transactions.splits.update`  | `PUT /transactions/:id/splits`       | `{ splits[], categoryId? }`: replaces the lines (sum invariant, 422 `splits`); `splits: []` makes it a single transaction again with `categoryId` (optional)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `transactions.bulkCategorize` | `POST /transactions/bulk-categorize` | `{ ids[], categoryId \| null }` → `{ updated, skipped }` (transfer legs, split rows and the partner's private rows are skipped; categorizing clears `needsReview`); a foreign id → 422 `ids`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `transfers.store`             | `POST /transfers`                    | `{ clientId?, fromAccountId, toAccountId, date, amountCents > 0, memo? }` → 201 `{ id, date, amountCents, fromAccountId, toAccountId, memo, clientId, legs: Transaction[2] }` (outgoing leg negative); same account → 422 `toAccountId`/`sameAccount`                                                                                                                                                                                                                                                                                                                                             |
| `transfers.update`            | `PATCH /transfers/:id`               | Any of the fields; both legs are rewritten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `transfers.destroy`           | `DELETE /transfers/:id`              | 204, removes both legs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `reports.month`               | `GET /reports/month`                 | `?month=YYYY-MM` (default: current month in the household time zone), `?paidByUserId=`. `{ month, from, to, incomeCents, expenseCents, netCents, byGroup[], byCategory[], byPerson[], uncategorizedCents, pendingCents, transactionCount, topMovers[] }`. Lines carry `bucket` (`category`/`group`, `uncategorized`, `private`), `kind` (expense\|income), `amountCents`, `count`; `byPerson` has a `joint` bucket. Transfers never count; refunds reduce their category; split lines count per category                                                                                          |
| `reports.trend`               | `GET /reports/trend`                 | `?months=6` (1–24), `?month=` (last month), `?groupBy=group\|category` → `{ months[], groupBy, totals[{ month, incomeCents, expenseCents, netCents }], series[{ bucket, id, kind, totalCents, points[{ month, amountCents }] }] }`                                                                                                                                                                                                                                                                                                                                                                |
| `reports.category`            | `GET /reports/category/:id`          | `?months=6&month=` → `{ months[], categoryId, kind, totalCents, averageCents, points[] }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `reports.balances`            | `GET /reports/balances`              | `{ accounts[{ accountId, currencyCode, isActive, clearedBalanceCents, availableBalanceCents }], totals: { [currencyCode]: { clearedBalanceCents, availableBalanceCents } } }` (never adds up different currencies)                                                                                                                                                                                                                                                                                                                                                                                |

### Payslips

A payout from an umbrella service (an account of kind `wallet`, any name):
the client pays the gross into the wallet, the service keeps the tax and its
fee, and transfers the net to the bank. A payslip records it as one income
row (the gross, category `salary`, payer = `userId`) and one expense row per
deduction in that account, every row carrying `payslipId`, and links the
wallet -> bank transfer of the net (one payslip per transfer). The rows are
ordinary ledger rows, so `reports.month` counts the gross as income and the
deductions as expenses with no special case. Invariant: `grossCents -
sum(deductions) = netCents = transfer amount`. Their amount, kind, account,
date and existence belong to the payslip: `PATCH`/`DELETE /transactions/:id`
answer 409 `E_PAYSLIP_LINE` when they would change them (category, payee,
notes, tags and privacy stay editable). There is no update: delete the
payslip and record it again. Deleting the linked transfer keeps the payslip
with `transferId: null`.

`Payslip` = `{ id, accountId, userId (null = joint), date, grossCents,
netCents, deductionsCents, memo, transferId, transfer: { id, date,
amountCents, fromAccountId, toAccountId } | null, lines[{ transactionId, kind
(income|expense), categoryId, amountCents (signed: the gross positive first,
then the deductions negative), memo, isMasked }], createdByUserId, createdAt,
updatedAt }`. A line the partner made private keeps its amount but not its
category or memo (`isMasked: true`).

| Name                  | Method and path                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payslips.index`      | `GET /payslips`                       | `?accountId=` (optional) → `Payslip[]`, newest first (`date`, then `id`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `payslips.store`      | `POST /payslips`                      | `{ accountId, date, userId? (null = joint; omitted = the account's owner), grossCents > 0, deductions[{ categoryId, amountCents > 0, memo? }] (0 to 3 lines), transferId? \| toAccountId?, memo? }` → 201 `Payslip`. One DB transaction: `transferId` links a transfer that left `accountId` (locked), `toAccountId` creates the `accountId` → `toAccountId` transfer of the net (`memo` as its memo). 422: `deductions`/`exceedsGross` (net <= 0), `deductions`/`netMismatch` (net differs from the transfer; with `netCents`, `transferCents`, `differenceCents`), `transferId`/`required` (neither), `toAccountId`/`exclusive` (both), `toAccountId`/`sameAccount`, `transferId`/`wrongAccount` (it does not leave the account), `transferId`/`linked` (another payslip has it, also under a race), foreign ids `<field>`/`database.exists` (`accountId`, `transferId`, `toAccountId`, `userId`, `deductions`) |
| `payslips.candidates` | `GET /payslips/candidates?accountId=` | `[{ transferId, date, amountCents, toAccountId, memo }]`: transfers leaving the account that no payslip links yet, newest first (at most 50); `accountId` required (422)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `payslips.destroy`    | `DELETE /payslips/:id`                | 204: the gross and deduction rows go, the transfer stays and is a candidate again                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Goals and insights

`Goal` = `{ id, name, targetCents, targetDate, startingCents,
monthlyContributionCents, accountId, userId (null = a goal of the household),
status (active|reached|archived), reachedAt, sortOrder, createdAt, updatedAt }`.

`GoalProjection` = `{ goalId, savedCents, targetCents, rateSource
(contribution|average|none), monthlyRateCents, remainingCents, monthsToGoal,
projectedDate, requiredMonthlyForTargetDate, onTrack, series[{ month,
projectedCents }] }`. Month granularity from the current month in the
household time zone (point 0 = saved today, then one monthly rate per month,
at most 24 points): `projectedDate` is the first day of the month the target
is reached, a target date counts as its month, `onTrack` = projectedDate <=
targetDate. Saved = the account's cleared balance (else `startingCents`);
rate = `monthlyContributionCents` (an explicit 0 included), else the average
net (income - expense) of the last three full months (the current month and
the quiet months before any activity never count), else none. A rate that is
none or <= 0 leaves the goal open-ended (`monthsToGoal`, `projectedDate`,
`onTrack` null); reached = `remainingCents` 0, `monthsToGoal` 0; a past target
date gives `requiredMonthlyForTargetDate` null and `onTrack: false`.

`Insight` = `{ month, locale, headline, bodyMarkdown, highlights[{ tone
(positive|neutral|warning), text }], model, generatedAt }`, one per household,
month and language (the request's locale). The model gets the month's totals,
the previous month's (null when it had no activity) and one line per category
(`{ slug, name, kind, amountCents, previousAmountCents }`, uncategorized as
slug `uncategorized`, names in that language), with every private purchase
counted in the totals but never as a line, the requester's own included: any
member reads the stored text.

| Name                | Method and path                  | Notes                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `goals.index`       | `GET /goals`                     | `?status=active\|reached\|archived` → `Goal[]` by `sortOrder`                                                                                                                                                                                                                                                                                                         |
| `goals.store`       | `POST /goals`                    | `{ name, targetCents > 0, targetDate?, startingCents? (>= 0), monthlyContributionCents? (>= 0, null = average), accountId?, userId? }` → 201; a foreign `accountId`/`userId` → 422 `<field>`/`database.exists`                                                                                                                                                        |
| `goals.reorder`     | `PUT /goals/reorder`             | `{ ids }` → 204 (`sortOrder` = position)                                                                                                                                                                                                                                                                                                                              |
| `goals.show`        | `GET /goals/:id`                 | `Goal`                                                                                                                                                                                                                                                                                                                                                                |
| `goals.update`      | `PATCH /goals/:id`               | Any field of `store` plus `status`; `reached` stamps `reachedAt` (kept while archived), `active` clears it. Reads never change the status, even past the target                                                                                                                                                                                                       |
| `goals.destroy`     | `DELETE /goals/:id`              | 204                                                                                                                                                                                                                                                                                                                                                                   |
| `goals.projection`  | `GET /goals/:id/projection`      | `GoalProjection`                                                                                                                                                                                                                                                                                                                                                      |
| `insights.show`     | `GET /insights/:month`           | `Insight` in the request's locale; 404 `E_ROW_NOT_FOUND` until generated in that language (or for a path that is not a `YYYY-MM` month)                                                                                                                                                                                                                               |
| `insights.generate` | `POST /insights/:month/generate` | `{ force? }` → 201 `Insight & { fresh: true }` (written now, replacing the stored one) or 200 `Insight & { fresh: false }` (the stored one, no LLM call). 422 `month`/`future` (not started) or `month`/`noActivity` (no income or spending) before any call; 402 `E_LLM_QUOTA_EXCEEDED`; 422 `E_LLM_OUTPUT_INVALID`; 503 `E_INSIGHTS_UNAVAILABLE` without an LLM key |

### Bank imports and merchant rules

How the pipeline decides each row: [import-pipeline.md](import-pipeline.md).

`ImportBatch` = `{ id, accountId, status (staged|completed|cancelled), source
(nab_csv), fileName, archived, dateFrom, dateTo, counts: { rows, new,
autoMatched, needsConfirmation, duplicate, transferLeg, ignored, superseded },
reconciliation: { asOf, expectedBalanceCents, computedBalanceCents,
differenceCents, balanced, openingBalanceCents, missingBefore },
uploadedByUserId, createdAt, completedAt }`. `counts.rows` is every row of the
file for the account (duplicates are counted, never stored). `reconciliation`:
the bank's balance on the newest row vs opening + ledger up to `asOf`
(projected while staged, measured on confirm); `balanced: false` means
movements before `missingBefore` are missing; `openingBalanceCents` is set on
the account's first import (derived from its oldest row).

`ImportRow` = `{ id, rowIndex, bankDate, date, amountCents, balanceCents,
transactionType, description (bank text, plain), descriptionNormalized,
merchantKey, merchantFullKey, nabCategory, nabMerchant, cardSuffix, isPending,
isFutureDated, resolution (new|auto_matched|needs_confirmation|transfer_leg|ignored|superseded),
needsReview, reasons[], match: { transactionId, score, upgradesPending,
transaction: { date, amountCents, payee, source, status } } | null,
suggestion: { source (rule|nab_map|llm|none), categoryId, confidence,
needsReview, ruleId, payee } | null, transfer: { signal
(rule|bank_category|linked_account_memo), accountId, legTransactionId, ruleId }
| null, suggestedPaidByUserId, decision, decidedAt, transactionId, confirmedAt,
isMasked }`. A row linked to the partner's private transaction comes with
`isMasked: true` and no bank text, merchant keys, NAB category/merchant,
suggestion or decision.

`Rule` = `{ id, matchType (merchant|contains|regex), pattern, categoryId,
transferAccountId, paidByUserId, payeeOverride, priority, origin
(user|learned|system), hitCount, lastHitAt, createdAt, updatedAt }`.

| Name                  | Method and path                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imports.index`       | `GET /imports`                   | Paginated `ImportBatch[]`, newest first; `?status=`, `page`, `perPage` (≤ 100, default 25)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `imports.store`       | `POST /imports`                  | multipart `file` (the bank CSV, ≤ 2 MB, read in memory) + optional `accountId` (the account the file belongs to; remembers its bank number) → 201 `ImportBatch[]`, one per `Account Number` of the file, staged in < 1 s without the model. A batch with nothing new (a re-upload) is `completed` at once. 422 `file`/`required`, `E_CSV_*`, `E_IMPORT_UNKNOWN_ACCOUNTS`, `accountId`/`accountNumberMismatch` \| `oneAccountOnly`; 409 `E_IMPORT_BATCH_OPEN`; 402 `E_IMPORT_LIMIT_REACHED`                                                                                                                                                                                      |
| `imports.show`        | `GET /imports/:id`               | `ImportBatch` + `rows: ImportRow[]` in file order (`?resolution=` filters them)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `imports.classify`    | `POST /imports/:id/classify`     | 202 `ImportBatch`. The model suggests categories for the open rows headed for spending/income whose category is missing or under review (rows a person categorized are skipped; at most 500 rows per run, 40 per model call, each call saved as it returns). 402 `E_LLM_QUOTA_EXCEEDED` up front; 409 `E_IMPORT_CLASSIFY_RUNNING` while another run of the batch goes on (a claim older than 10 minutes is taken over); a model failure keeps what was answered and is not an error                                                                                                                                                                                             |
| `imports.rows.update` | `PATCH /imports/:id/rows/:rowId` | `{ resolution? (new\|auto_matched\|transfer_leg\|ignored), categoryId?, splits?[{ categoryId, amountCents, memo? }], transferAccountId?, matchTransactionId?, paidByUserId? (null = joint), payee?, learnRule? }` → `ImportRow` (keys left out keep the proposal). 422: foreign ids `<field>`/`database.exists`, `transferAccountId`/`required` \| `sameAccount`, `matchTransactionId`/`required` \| `sameAccount` \| `amountMismatch` \| `claimed` (already the copy of a posted bank row, or picked by another row of the batch or of the same confirm), `resolution`/`zeroAmount` (a 0.00 row can only be `ignored`), split sums; 409 `E_IMPORT_BATCH_CLOSED` once confirmed |
| `imports.confirm`     | `POST /imports/:id/confirm`      | `{ decisions?[{ rowId, …same fields as rows.update }] }` → `{ batchId, status, created, matched, ignored, transfers, remaining, reconciliation }`. One DB transaction (batch locked): new rows become `source: import` transactions (pending or cleared, bank date, bank text, card, payer from the card), matches stamp the bank's data on the existing row (a pending import is upgraded and its old row `superseded`), transfers get both legs, ignored rows stay; rules are learned. 422 `E_IMPORT_ROWS_UNDECIDED` while a possible match or an unknown transfer account waits; 409 `E_IMPORT_BATCH_CLOSED`                                                                 |
| `imports.cancel`      | `POST /imports/:id/cancel`       | `ImportBatch` (`cancelled`): the rows still waiting are deleted, so the same file can be staged again; 409 once closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `rules.index`         | `GET /rules`                     | `Rule[]`, highest priority first (the bank defaults are `system`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `rules.store`         | `POST /rules`                    | `{ matchType, pattern, categoryId?, transferAccountId?, paidByUserId?, payeeOverride?, priority? }` → 201 (`origin: user`). A `merchant` pattern is stored as a merchant key (lowercase words, no numbers). 422 `categoryId`/`required` (no target), `pattern`/`maxLength` (200), `pattern`/`regex`, `pattern`/`unsafeRegex` (nested or alternated repetition, backreferences: rules run on every imported row; an unsafe stored pattern never runs), `pattern`/`taken`, foreign ids                                                                                                                                                                                            |
| `rules.update`        | `PATCH /rules/:id`               | Any field; the rule becomes `origin: user`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `rules.destroy`       | `DELETE /rules/:id`              | 204                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `rules.apply`         | `POST /rules/:id/apply`          | `{ updated }`: the transactions still in triage (`needsReview`) the rule matches get its category (and payee/payer when set); transfers, split rows and the partner's private rows are skipped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Backfill from a shell (local, or `docker exec` into the production
container): `node ace import:nab <file.csv> --account <bank number|account id>
--household <id> [--confirm-auto]` stages like `POST /imports` (as the
household's owner) and prints a summary; `--confirm-auto` confirms matches,
known transfers, zero-amount checks and categorized new rows, and leaves the
rest staged for the review screen.

### Receipts and uploads

Receipt photos never pass through the API and nothing about a receipt is
stored. The flow:

1. `POST /uploads/presign` with what the client is about to upload: the
   server picks the key and signs a PUT for exactly that type and size.
2. The browser PUTs the photo (already reduced on the device) to `url` with
   `headers`, before `expiresAt`. Another type or size is refused by the
   bucket (403); the bucket allows the app origin through CORS
   (`node ace storage:configure`, see the runbook).
3. `POST /receipts/scan` with the `key`: the API reads the photo, reduces it
   again (≤ 1600 px, JPEG, metadata stripped), asks the vision model and
   deletes the photo whatever the outcome. A photo nobody scans expires from
   the bucket after one day. Each key scans once: retrying needs a new upload.
4. The person reviews the draft and saves it with `POST /transactions` and
   `source: 'receipt'` (`amountCents` from `totalCents`, `payee` from
   `merchant`, `categoryId`, or `splits` built from `items`).

`ReceiptDraft` = `{ merchant, date, totalCents, currencyCode, categoryId,
categorySlug, items: [{ description, amountCents, quantity }], confidence,
key }`. Amounts are cents as printed on the receipt (positive); any field but
`items`, `confidence` (0..1) and `key` is null when unreadable. `categorySlug`
is one of the household's visible categories (hidden ones are never offered)
and `categoryId` is that category's id.

| Name              | Method and path         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uploads.presign` | `POST /uploads/presign` | `{ kind: 'receipt', contentType: image/jpeg\|image/png\|image/webp, byteSize (exact bytes to PUT, ≤ 10 MB) }` → 201 `{ key, url, headers, expiresAt }`. The key is `receipts/<householdId>/<uuid>.<ext>`, chosen by the server (a `key` in the body is ignored); the URL works for 5 minutes. 422 `contentType`/`enum`, `byteSize`/`max` \| `min`, `kind`/`enum`; 503 `E_STORAGE_UNAVAILABLE` without a bucket. 30 per minute per user                                                                                           |
| `receipts.scan`   | `POST /receipts/scan`   | `{ key }` → `ReceiptDraft`. 404 `E_ROW_NOT_FOUND` for a key outside the household's prefix (the object is never touched) or an object that is not there; 422 `key`/`mimetype` \| `fileSize` \| `image` (not JPEG/PNG/WebP, over 10 MB, not a readable image); 402 `E_LLM_QUOTA_EXCEEDED` (checked before reading the photo); 422 `E_LLM_OUTPUT_INVALID`; 503 `E_LLM_UNAVAILABLE` (model down, or no `LLM_API_KEY`) / `E_STORAGE_UNAVAILABLE`. Each model call is an `llm_usage` row (`purpose: receipt`). 10 per minute per user |
