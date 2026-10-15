# Runbook

Operations for production (`https://app.example.com`, Dokploy on the Oracle
ARM server). Fill the TODOs as the infrastructure work packages land.

## Dokploy ids

| What               | Value                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Project            | `monkimoney` (projectId `<id>`, environmentId `<id>`)                                       |
| Postgres service   | `monkimoney-db` (postgresId `<id>`, appName/host `monkimoney-db-xxxxxx`, volume `monkimoney-db-xxxxxx-data`) |
| Application        | `monkimoney-web` (applicationId `<id>`, appName `monkimoney-web-xxxxxx`, domainId `<id>`)   |
| Domain             | `app.example.com`, https, `certificateType: none`, port 3333                                                               |
| GitHub provider    | App `dokploy-<server>` (githubId `<id>`)                                                                  |
| Backup destination | R2 destination `<id>`, prefix `monkimoney/`, daily 16:15 UTC, keep 60 (backupId: see panel)                  |

## GitHub

- Repo `MikePineda/monki-money` (private). Required checks on `main`: `ci`
  and `commitlint`; merge methods: merge commit (atomic commits) or squash.
- The protection lives as code in `.github/rulesets/main.json`. GitHub Free
  does not allow rulesets or branch protection on private repos, so it is
  **not applied yet**. After upgrading the account to GitHub Pro:

  ```bash
  gh auth switch --user MikePineda
  gh api -X POST repos/MikePineda/monki-money/rulesets --input .github/rulesets/main.json
  gh auth switch --user <work-account>
  ```

  Until then, the rule is social: no direct pushes to `main`, PRs only, and
  only with `npm run verify` and CI green.

- Secret `RELEASE_PLEASE_TOKEN`: fine-grained PAT of the owner scoped to this
  repo, Contents + Pull requests read/write. Without it the release PR is
  opened with `GITHUB_TOKEN`, which does not trigger CI, so its required
  checks never report.
- Actions setting: workflow permissions read-only by default, "Allow GitHub
  Actions to create and approve pull requests" on (release-please fallback).

## Deploy and verification

Merge to `main` -> Dokploy webhook -> ARM64 build on the server (target
`runtime`) -> Swarm start-first update with rollback. The `ship` skill
(`.claude/skills/ship`) runs the whole sequence; by hand:

### Post-deploy verification

```bash
# 1. Wait until production reports the merge commit (polls /api/health, browser UA).
.claude/skills/ship/scripts/wait-for-deploy.sh https://app.example.com "$(git rev-parse origin/main)"

# 2. Smoke as the smoke user: health, CSRF handshake, login, me, household,
#    accounts, categories, logout (Bruno, read-only in prod).
npm run smoke:prod

# 3. PWA files are never cached.
curl -sI https://app.example.com/ngsw-worker.js | grep -i 'cache-control\|cf-cache-status'
# expect: cache-control: no-cache, cf-cache-status: DYNAMIC or BYPASS
```

Expect 2 to 4 minutes from merge to live (build about 70 s, healthcheck
start period 60 s). Production still on the old sha after that means a
failed build or an automatic rollback: see "The two Dokploy traps".

Before the first push of Docker changes: `docker build --target runtime -t
monkimoney:local .` on the Mac (see `CLAUDE.md` for running it).

### Talking to production from scripts

- **Browser User-Agent, always.** Cloudflare's Browser Integrity Check
  answers 403 to clients that do not look like a browser (python-urllib got
  403). curl's default UA passes today, but send a browser one anyway:
  `curl -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'`.
  The Bruno collection sets it on every request.
- **CSRF: GET first.** Every response sets the `XSRF-TOKEN` cookie; every
  POST/PUT/PATCH/DELETE (login included) must send it back as
  `X-XSRF-TOKEN` with the same cookie jar, or the API answers 403
  `E_BAD_CSRF_TOKEN`. So: `GET /api/v1/config` (or any GET), then the write.

## The two Dokploy traps

1. **`--target` is always passed.** The final stage must stay named
   `runtime`. A build failing in about a second is this.
2. **Build green but `0/1` replicas** is a boot crash: an env var missing from
   the panel (`start/env.ts` validates everything at boot) or a failing
   migration. Read the service logs before touching code.

## Environment (names only; values live in the Dokploy panel)

The full, commented list is `apps/api/.env.example`. Production specifics:
`NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3333`, `APP_KEY`, `APP_URL`,
`DB_HOST=monkimoney-db`, `DB_*`, `SESSION_DRIVER=cookie`,
`LIMITER_STORE=database`, `REGISTRATION_OPEN=false`, `DRIVE_DISK`, `S3_*`,
`LLM_*`, `MAIL_DRIVER`, `RESEND_API_KEY`, `MAIL_FROM`, `SENTRY_DSN`,
`SENTRY_DSN_WEB`, `APP_DEFAULT_LOCALE` (optional, `en`), `MIGRATE_ON_START=true`,
`SEED_USERS` (first deploy only), `SEED_HOUSEHOLD_NAME`, `SEED_LOCALE`,
`SEED_USER1_EMAIL`/`_NAME`/`_PASSWORD`/`_CARD_SUFFIX`,
`SEED_USER2_EMAIL`/`_NAME`/`_PASSWORD`/`_CARD_SUFFIX`,
`SEED_JOINT_ACCOUNT_NUMBER`, `SMOKE_EMAIL`, `SMOKE_PASSWORD` (smoke user,
see "Smoke test"), `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET` (empty = bot
check off, see "Turnstile").

The production bootstrap (`database/seeders/production_bootstrap_seeder`) is
idempotent by email and account name and never resets a password, so a
redeploy with `SEED_USERS=true` is harmless; still set it back to `false` and
delete the `SEED_*_PASSWORD` values after the first deploy. It logs ids only.

## Backups, restore and drill

DONE 2026-10-15: Dokploy `backup-create` for `monkimoney-db` to the R2
destination, prefix `monkimoney/`, cron `15 16 * * *` UTC (02:15 Brisbane),
keep 60. Manual: `backup-manualBackupPostgres`. List:
`backup-listBackupFiles`. Restore:

```bash
gunzip -c <file>.dump.gz | docker exec -i $(docker ps -q -f name=monkimoney-db) \
  pg_restore -U monkimoney -d monkimoney --clean --if-exists --no-owner
```

A restore drill into `monkimoney_restore_test` is mandatory after the first
backup. TODO: record the date and result here.

## Logs

`application-readLogs` (Dokploy MCP) or on the server
`docker service logs monkimoney-web-<suffix> --since 1h`. Logs are pino JSON on
stdout; secrets, cookies and emails are redacted.

## Rollback, reload, scale

- Rollback: Dokploy `rollback-rollback {rollbackId}` (ids from
  `deployment-all`, only when rollbacks are enabled for the application) or
  the panel, else revert the merge (`git revert -m 1 <merge-sha>`) and ship
  the revert. Details: `.claude/skills/ship/SKILL.md` → "Rollback".
- Reload without rebuild: `application-reload`.
- Scale: `replicas: 2` is safe (pool 10 x replicas < 100 connections) once
  `MIGRATE_ON_START=false` and migrations run out of band.

## Deleting a household's data

TODO (API base package): `node ace household:delete <id> --confirm` (database,
S3 prefix, audit line).

## Secret rotation

`APP_KEY` (invalidates every session), `DB_PASSWORD` (`postgres-changePassword`),
R2 token, `LLM_API_KEY`, `RESEND_API_KEY`, Dokploy API key, `SMOKE_PASSWORD`,
origin certificate (expires 2041).

## Certificate and Cloudflare

Origin certificate `example.com & *.example.com` uploaded in Dokploy
Settings -> Certificates (pasted by the owner). Cloudflare: A `money` proxied,
SSL Full (strict) via configuration rule, cache bypass for `/`,
`/index.html`, `/ngsw-worker.js`, `/ngsw.json`, `/manifest.webmanifest`,
`/i18n/*`, `/api/*`; Rocket Loader and Bot Fight Mode off; rate limit on
`/api/v1/auth/`. TODO: confirm each item once applied.

**Client IP trust depends on Traefik's Cloudflare allowlist (`cf-only@file`).**
The API takes the client IP from `CF-Connecting-IP` only when the TCP peer
is the local proxy (loopback/private address), i.e. Traefik, and Traefik only
accepts Cloudflare's ranges. Never remove `cf-only@file` from the router, nor
publish the app port directly: anyone could then forge the header and get
a fresh rate-limit bucket per request. If Cloudflare publishes new ranges,
update the allowlist (otherwise every request is answered 403).

## Smoke test (Bruno)

Collection: `apps/api/bruno` (how it works and how to add a request:
`apps/api/bruno/README.md`). Nine requests in `seq` order: `/api/health`,
`/api/health/live`, `/api/v1/config` (CSRF handshake), login, `auth/me`,
`household`, `accounts`, `categories?tree=1`, logout. Runs with `--bail`.

```bash
npm run smoke:local      # against npm run dev (http://localhost:3333)
npm run smoke:prod       # against production, after every deploy
```

Credentials: `SMOKE_EMAIL` and `SMOKE_PASSWORD` exported in the shell or in
`apps/api/bruno/.env` (gitignored); environments only reference
`{{process.env.*}}`. Against `prod` the collection only reads (plus the
smoke user's login/logout): its pre-request script skips any other write,
and `04-login` fails the run unless the user landed in the "Smoke"
household. Five failed logins per minute block the IP + email for 20
minutes, so fix a wrong password before retrying.

**Smoke user (one-time setup in production).** The production bootstrap
seeder creates it from `SMOKE_EMAIL` / `SMOKE_PASSWORD`: verified, alone in
its own household "Smoke", no accounts, never the real household
(`SMOKE_EMAIL` must differ from every `SEED_USER*_EMAIL`). In the Dokploy
panel set `SMOKE_EMAIL`, `SMOKE_PASSWORD` (10+ characters) and
`SEED_USERS=true`, then redeploy. Either keep the whole `SEED_*` household
block complete (idempotent, never resets a password) or clear every
`SEED_*` household variable: a partial block fails validation, the seeder
aborts the boot and Swarm rolls back. After the deploy, check the log line
`production bootstrap: smoke user ready`, set `SEED_USERS=false` and run
`npm run smoke:prod` with the same credentials locally. Rotation: change
the password in the app as the smoke user (the seeder never resets it),
then update `SMOKE_PASSWORD` wherever the smoke runs.

## Opening registration

`REGISTRATION_OPEN=true` + redeploy (start-first), with Turnstile, Sentry,
rate limits and email verification active.

## Turnstile

Cloudflare Turnstile guards sign-up, login and forgot password. It is off
while `TURNSTILE_SECRET` is empty (the API ignores `turnstileToken`).

1. Cloudflare dashboard (Mike) -> Turnstile -> add a widget for the app's
   hostname (managed mode) and copy the site key and the secret key.
2. Dokploy -> monkimoney-web -> Environment: set `TURNSTILE_SITE_KEY` and
   `TURNSTILE_SECRET`, then redeploy (start-first). `GET /api/v1/config`
   now returns `turnstileSiteKey`.
3. From then on the three endpoints answer 422 (`turnstileToken` /
   `turnstile`) without a valid widget token. The web widget lands with the
   next web package: do not set the secret in production before that
   release is deployed, or nobody can log in. To roll back, empty
   `TURNSTILE_SECRET` and redeploy.

Cloudflare's test keys always pass (useful for staging and E2E): site key
`1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`.
The API calls `challenges.cloudflare.com` (5 s timeout) and fails closed,
so a Cloudflare outage blocks logins until the secret is emptied; the log
line `turnstile siteverify failed` tells it apart from bots.

## LLM cost

One `llm_usage` row per model round trip (retries included); `cost_micros` is
micro-dollars from the price table in `apps/api/config/llm.ts`. Spend and
failure rate per household and month (NULL household = `llm:smoke`):

```bash
docker exec -i $(docker ps -q -f name=monkimoney-db) psql -U monkimoney -d monkimoney -c "
  SELECT household_id, date_trunc('month', created_at) AS month, purpose,
         count(*) AS calls,
         count(*) FILTER (WHERE status <> 'ok') AS failed,
         sum(input_tokens) AS input_tokens, sum(output_tokens) AS output_tokens,
         round(sum(cost_micros) / 1e6, 4) AS usd
  FROM llm_usage GROUP BY 1, 2, 3 ORDER BY 2 DESC, 1, 3;"
```

The `pulse` skill runs this month's version from the Mac, read-only and
together with health, logs, deployments, backups and disk:

```bash
ssh <server> 'docker exec -i $(docker ps -q -f name=monkimoney-db) \
  psql -U monkimoney -d monkimoney -X -q -v ON_ERROR_STOP=1 -f -' < .claude/skills/pulse/pulse.sql
```

Check the live endpoint with `node ace llm:smoke` inside the app container
(see `docs/llm.md`).

## Disk

The server's `/` is small; Docker lives on `/mnt/data`. Watch the build cache
(`dockerDiskUsage-getBuildCache`) and keep Dokploy's weekly Docker cleanup on.
