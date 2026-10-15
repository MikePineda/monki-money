# monkimoney: agent rules

Couples' finance PWA (AUD, one household, two people today; built as a
multi-household SaaS from day one). Read this file first, then
`docs/ARCHITECTURE.md`, `docs/CONTRACTS.md` and `BRIEF.md`.

**Owner Q&A lives in `docs/internal/QA.md` (gitignored): read it before
starting a work package.** `docs/internal/` is local-only scratch (owner Q&A,
plan copies such as `PLAN-2026-10-15.md`, notes) and is never committed.

New ideas mid-session go to `docs/BACKLOG.md` as a dated one-liner, then you
continue with the work in progress.

## Repo map

| Path                                           | What                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/api`                                     | AdonisJS 7 API (`@monkimoney/api`), Postgres 17, Lucid, Japa. Serves the SPA in production. |
| `apps/web`                                     | Angular 22 PWA (`@monkimoney/web`), zoneless, Tailwind 4, Vitest.                           |
| `packages/shared`                              | `@monkimoney/shared`: wire types and pure helpers, compiled to `dist/`.                     |
| `e2e`                                          | Playwright suite against the real stack (`@monkimoney/e2e`).                                |
| `docker/`, `Dockerfile`, `docker-compose*.yml` | Production image, entrypoint, local and E2E stacks.                                         |
| `docs/`                                        | Architecture, contracts, runbook, backlog. `docs/design/` gets the design system.           |

## Non-negotiables

- **English** for code, comments, docs, commit messages and skills. The UI is
  bilingual (es-MX and en-AU) through translation catalogs, with a parity
  test that fails on any missing key. Never hardcode user-facing copy.
- **TDD.** The test comes first and its name reads like a spec
  (`test_transfer_is_excluded_from_expense_totals`). Every business rule is
  born with its test. Laravel to Japa:

  | Laravel                                        | Here                                                                                                              |
  | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
  | `RefreshDatabase`                              | automatic for the `functional` suite: migrate once per suite + global transaction per test (`tests/bootstrap.ts`) |
  | `postJson()->assertStatus()`                   | `client.post(...).json(body).loginAs(user)` then `response.assertStatus()` / `assertBodyContains()`               |
  | `assertDatabaseHas`                            | `db.assertHas('table', {...})` (`dbAssertions`)                                                                   |
  | factories                                      | Lucid factories with states                                                                                       |
  | `actingAs`                                     | `.loginAs(user)` (guard `web`, `sessionApiClient` + `authApiClient`)                                              |
  | `Mail::fake` / `Storage::fake` / `Queue::fake` | `mail.fake()` / `drive.fake('s3')` / `QUEUE_DRIVER=sync`                                                          |

- **No personal data in the repo.** Real names, emails and bank exports live
  only in `.env` / the Dokploy panel / the private bucket. Fixtures are
  synthetic with the real structure. `*.csv` is gitignored outside
  `tests/fixtures/`. Seed data comes from `SEED_*` env vars.
- **Migrations are additive.** Swarm updates start-first, so two versions run
  side by side for seconds. Add columns/tables; drop only in a later release.
- **Stateless app.** No volume on the API container: sessions in the cookie
  store, files in S3-compatible storage (Cloudflare R2), logs to stdout.
- **Secrets only in env / Dokploy.** `apps/api/start/env.ts` validates every
  variable at boot; secrets use `Env.schema.secret()`. Never type an env var as
  a list or an object: keep the raw string and parse it where it is used.
- **No domains in source code.** Domains live in env vars, `.env.example`
  comments and docs.
- **Tenant isolation:** every resource hangs from `household_id`; another
  household's id answers **404, never 403**.
- **Money is integer cents** (`*Cents`), dates are `YYYY-MM-DD` strings.
- **Conventional Commits** (commitlint locally via lefthook and in CI). Types
  drive SemVer through release-please, which owns `CHANGELOG.md`: never edit it
  by hand. Extra type: `security`.
- **No PR without `npm run verify` green** (the `verify` skill runs it and
  refuses to open a PR when it is red).
- **Deploy = merge to `main`.** Dokploy builds the image on the server and does
  a start-first Swarm update with rollback.

## Working mode: master agent + Opus 5.5 subagents

The implementing session acts as **master**: it decides, cuts work into
packages, writes briefs, launches subagents, integrates, runs `npm run verify`,
talks to the owner and keeps memory. It does not write feature code beyond
one-line integration fixes.

Each **subagent** gets one self-contained package (`Agent`,
`subagent_type: general-purpose`, `model: "opus"`; never `fork`, which would
inherit the master's whole context). Independent packages run in parallel with
`isolation: "worktree"`; packages touching the same files run in series.

A brief contains only: (1) goal and done criterion; (2) minimal context
(this file, `docs/ARCHITECTURE.md`, `BRIEF.md`, files to touch, references);
(3) the contract (tables, endpoints, components) copied from the plan;
(4) rules (TDD, English comments, nothing personal, Conventional Commits, stay
inside the package); (5) mandatory verification command; (6) report format,
at most 25 lines. The master reads reports, not full diffs (reviews go to a
reviewer subagent or `/code-review`). If a subagent fails twice, the master
rereads the affected files and rewrites the brief, not the code.

## How to run

Node 24 (`nvm use 24`), Docker Desktop.

```bash
docker compose up -d                       # Postgres 17 (5432) + MinIO (9030) + buckets
cp apps/api/.env.example apps/api/.env && (cd apps/api && node ace generate:key)
npm install                                # also installs the commit-msg hook
(cd apps/api && node ace migration:run)
npm run dev                                # api :3333 + web :4200 (proxies /api)
npm run test                               # Japa + Vitest + shared node:test
npm run e2e                                # Playwright vs docker-compose.test.yml (5433/9100)
npm run verify:quick                       # lint + typecheck + test + build
npm run verify                             # verify:quick + e2e (the PR gate)
npm run codegen                            # regenerate the Tuyau registry after route changes
docker build --target runtime -t monkimoney:local .   # faithful prod rehearsal (ARM64)
docker compose --profile tools up -d pgweb # DB browser on 127.0.0.1:8081
```

Run the image locally against the compose database:

```bash
docker run --rm --network monkimoney_default -p 127.0.0.1:3333:3333 \
  -e APP_KEY=$(openssl rand -hex 32) -e APP_URL=http://localhost:3333 -e LOG_LEVEL=info \
  -e REGISTRATION_OPEN=false -e SESSION_DRIVER=cookie -e LIMITER_STORE=database \
  -e DB_HOST=db -e DB_PORT=5432 -e DB_USER=monkimoney -e DB_PASSWORD=monkimoney \
  -e DB_DATABASE=monkimoney -e MIGRATE_ON_START=true monkimoney:local
curl -s localhost:3333/api/health
```

## Known traps (each one already cost time)

- **Dokploy always passes `--target`.** The Dockerfile's final stage must stay
  named `runtime`; an unnamed final stage fails the build in about a second.
  A build that is green but leaves `0/1` replicas is a boot crash (env or
  migration): read the service logs.
- **PWA files must never be cached**: `index.html`, `ngsw-worker.js`,
  `ngsw.json`, `manifest.webmanifest` and `/i18n/*` get `no-cache` +
  `CDN-Cache-Control: no-store` (`app/services/static_cache_policy.ts`), and
  Cloudflare needs its bypass cache rule too. Otherwise installed apps stay
  pinned to an old build. Hashed bundles are `immutable`.
- **Client IP is `CF-Connecting-IP`.** Behind Cloudflare and Traefik,
  `request.ip()` is a proxy. Rate limits and audit logs must use the single
  `clientIp(ctx)` helper (`app/services/http/client_ip.ts`).
- **Native Postgres enums survive `migration:fresh`.** Use
  `node ace migration:fresh --drop-types` locally (the test suite rolls back
  with the migrations' `down`, which drop their types).
- **Every household-scoped read goes through the scope.** Lists use
  `Model.query().withScopes((s) => s.forHousehold(ctx.household))`, single
  rows `findInHousehold(Model, ctx.household, id)` (404 across households).
  A new route with `:id` fails `tenant_isolation.spec.ts` until it gets a case.
- **`.adonisjs/` is generated and committed.** After touching routes or
  controllers run `npm run codegen`; CI fails on any diff.
- **The web compiler type-checks API sources** reached through the Tuyau
  registry, with the web's stricter flags. API code must compile under them
  (for example `override` on overridden members).
- **`node ace build` / `node ace test` rewrite `.adonisjs/`.** The API `test`
  script runs `bin/test.ts` directly and turbo orders every reader after
  `api#codegen` to avoid reading a half-written file. Use `npm run test:watch -w
@monkimoney/api` for the watch mode.
- **Global styles are plain CSS.** Tailwind 4 is a PostCSS plugin and does not
  support Sass, so `src/styles.css` is the Tailwind entry; components may use SCSS.
- **Tuyau needs an absolute `baseUrl`**: the web client uses
  `document.location.origin` (same origin, no CORS; CORS is disabled).
- **Prod dependencies need `--omit=optional`**: playwright, typescript and
  ts-morph are optional peers of runtime packages and `--omit=dev` keeps them.
- **MinIO images**: upstream `minio/minio` is no longer published; compose and
  CI use Bitnami's frozen build. Local MinIO is on port 9030 (9000-9020 are
  usually taken on macOS). `docker compose up --wait` fails on the one-shot
  `minio-init` even when it exits 0: wait on `db minio` and `run` the init.
