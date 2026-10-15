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
  / `E_BAD_CSRF_TOKEN`, 409 `E_ACCOUNT_IN_USE` / `E_CATEGORY_IN_USE` /
  `E_GROUP_NOT_EMPTY` / `E_ALREADY_IN_HOUSEHOLD`, 410 `E_INVITATION_EXPIRED`,
  400 `E_INVALID_TOKEN`. Auth, throttle and role failures keep the framework
  shape `{ errors: [{ message }] }`: 400 bad credentials, 401 not logged in
  (or revoked session), 403 role (`HouseholdPolicy`), 429 throttled (with
  `Retry-After`).
- Unknown routes: JSON 404 (`{ message, code }`), including any `/api/*` GET
  that would otherwise hit the SPA fallback.
- Amounts are integer cents named `*Cents`; dates are `YYYY-MM-DD`;
  timestamps are ISO-8601 UTC strings.
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

Middleware per group: public auth routes (throttled per IP + email);
_authenticated_ (`auth` + session version: `auth.me`, `auth.logout*`,
`auth.email.resend`, `me.update`); _household_ (authenticated + verified email

- household context + 300 req/min per user: everything under `/household`,
  `/accounts`, `/category-groups`, `/categories`). `household.restore` is the
  only household route allowed while the household is pending deletion.

Test-only: `POST /api/test/reset` (wipe + seed the E2E household; exists only
with `NODE_ENV=test` or `E2E_MODE=true`, CSRF-exempt, not in the registry).

## Endpoints today

All business routes are under `/api/v1`. "Owner" = `HouseholdPolicy` (403 for
members). Bodies in `{ data }` unless noted.

| Name                                                          | Method and path                                                                                | Notes                                                                                                                                                                                        |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health.ready`                                                | `GET /api/health`                                                                              | `HealthReport` (`@monkimoney/shared`), 200 or 503                                                                                                                                            |
| `health.live`                                                 | `GET /api/health/live`                                                                         | `{ status: 'ok' }`                                                                                                                                                                           |
| `config.show`                                                 | `GET /config`                                                                                  | `PublicConfig`: `registrationOpen`, `version`, `turnstileSiteKey`, `sentryDsnWeb`, `defaultLocale`                                                                                           |
| `auth.signup`                                                 | `POST /auth/signup`                                                                            | `{ fullName, email, password (10+), locale?, householdName? }` → 201 `{ user, household }`, logs in, sends the verification mail. 403 `E_REGISTRATION_CLOSED` when `REGISTRATION_OPEN=false` |
| `auth.login`                                                  | `POST /auth/login`                                                                             | `{ email, password }` → `{ user, household \| null }`. 5 failures/min per IP + email, then 20 min blocked (429)                                                                              |
| `auth.me`                                                     | `GET /auth/me`                                                                                 | `{ user, household, membership, entitlements, flags }` (household/membership/entitlements null without a household)                                                                          |
| `auth.logout`                                                 | `POST /auth/logout`                                                                            | 204, this session only                                                                                                                                                                       |
| `auth.logout_all`                                             | `POST /auth/logout-all`                                                                        | 204, bumps `session_version` (every device)                                                                                                                                                  |
| `auth.email.verify`                                           | `POST /auth/email/verify`                                                                      | Public `{ token }` (from `/verify-email?token=`) → `{ emailVerifiedAt }`; 400 `E_INVALID_TOKEN`                                                                                              |
| `auth.email.resend`                                           | `POST /auth/email/resend`                                                                      | 202; no-op once verified                                                                                                                                                                     |
| `auth.password.forgot`                                        | `POST /auth/password/forgot`                                                                   | `{ email }` → always 200 `{ requested: true }`; 5/min per IP + email                                                                                                                         |
| `auth.password.reset`                                         | `POST /auth/password/reset`                                                                    | `{ token, password }` (from `/reset-password/:token`, 1 h, single use) → `{ reset: true }`; revokes every session                                                                            |
| `auth.invitations.show`                                       | `GET /auth/invitations/:token`                                                                 | Public: `{ email, role, householdName, inviterName, expiresAt, userExists }`; 404 unknown, 410 expired/used                                                                                  |
| `auth.invitations.accept`                                     | `POST /auth/invitations/:token/accept`                                                         | `{ fullName?, password? }`: new account (verified, ignores `REGISTRATION_OPEN`) or existing one (its password) → `{ user, household }`, logs in. 409 if the user already has a household     |
| `me.update`                                                   | `PATCH /me`                                                                                    | `{ fullName?, locale?, theme?, password? + currentPassword }` → `User`; a password change logs out the other devices                                                                         |
| `household.show`                                              | `GET /household`                                                                               | `Household`                                                                                                                                                                                  |
| `household.update`                                            | `PATCH /household`                                                                             | Owner. `{ name?, locale?, timezone? }`                                                                                                                                                       |
| `household.members`                                           | `GET /household/members`                                                                       | `Member[]` (`userId`, `fullName`, `email`, `role`, ...)                                                                                                                                      |
| `household.export`                                            | `GET /household/export`                                                                        | Owner. Streamed JSON download (household, members, accounts with cards, category groups, categories; ledger joins later)                                                                     |
| `household.delete`                                            | `POST /household/delete`                                                                       | Owner. `{ password }` → `Household` with `status: 'pending_deletion'`, `deletionScheduledAt` (+30 days)                                                                                      |
| `household.restore`                                           | `POST /household/restore`                                                                      | Owner, within the window. 409 if not pending, 410 if the window ended                                                                                                                        |
| `household.invitations.index`                                 | `GET /household/invitations`                                                                   | Owner. Pending invitations                                                                                                                                                                   |
| `household.invitations.store`                                 | `POST /household/invitations`                                                                  | Owner. `{ email, role? }` → 201 invitation with `url` (shown once; also emailed), 7 days                                                                                                     |
| `household.invitations.destroy`                               | `DELETE /household/invitations/:id`                                                            | Owner. 204                                                                                                                                                                                   |
| `accounts.index`                                              | `GET /accounts`                                                                                | `Account[]` with `cards`, `clearedBalanceCents`, `availableBalanceCents` (opening balance until the ledger exists)                                                                           |
| `accounts.store`                                              | `POST /accounts`                                                                               | `{ name, kind, institution?, ownerUserId? (null = joint), currencyCode?, externalAccountNumber? (unique per household), openingBalanceCents?, openingBalanceDate?, isActive? }` → 201        |
| `accounts.show` / `accounts.update`                           | `GET` / `PATCH /accounts/:id`                                                                  | Same fields, all optional on PATCH                                                                                                                                                           |
| `accounts.destroy`                                            | `DELETE /accounts/:id`                                                                         | 204; 409 `E_ACCOUNT_IN_USE` once it has transactions                                                                                                                                         |
| `accounts.reorder`                                            | `PUT /accounts/reorder`                                                                        | `{ ids }` → 204 (`sortOrder` = position)                                                                                                                                                     |
| `accounts.cards.store`                                        | `POST /accounts/:id/cards`                                                                     | `{ cardSuffix, userId?, label? }` → 201                                                                                                                                                      |
| `accounts.cards.destroy`                                      | `DELETE /accounts/:id/cards/:cardId`                                                           | 204                                                                                                                                                                                          |
| `category_groups.index`                                       | `GET /category-groups`                                                                         | `CategoryGroup[]`                                                                                                                                                                            |
| `category_groups.store` / `.update` / `.destroy` / `.reorder` | `POST /category-groups`, `PATCH`/`DELETE /category-groups/:id`, `PUT /category-groups/reorder` | `{ name, kind? }`, `{ name?, isHidden? }`; delete 409 `E_GROUP_NOT_EMPTY`                                                                                                                    |
| `categories.index`                                            | `GET /categories[?tree=1]`                                                                     | `Category[]`, or groups with `categories` nested                                                                                                                                             |
| `categories.store` / `.update`                                | `POST /categories`, `PATCH /categories/:id`                                                    | `{ categoryGroupId, name, icon?, isHidden? }`; renaming a system category makes it custom; slug never changes                                                                                |
| `categories.destroy`                                          | `DELETE /categories/:id`                                                                       | `{ reassignToCategoryId? }` → 204; 409 `E_CATEGORY_IN_USE` when referenced without a replacement                                                                                             |
| `categories.reorder`                                          | `PUT /categories/reorder`                                                                      | `{ ids }` → 204                                                                                                                                                                              |
