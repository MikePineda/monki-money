# Runbook

Operations for a production deployment: one ARM64 server running Dokploy
(Docker Swarm + Traefik), Cloudflare in front, Postgres as a Dokploy service
and an S3-compatible bucket (Cloudflare R2). Fill the TODOs as the
infrastructure work packages land.

Placeholders used below: `<app-domain>` is the app's public hostname,
`<server>` the SSH host of the Dokploy server.

## Local operator settings

Commands and skills that reach production read these variables from the
shell, or from `docs/internal/ops.env` (local only, never committed; load it
with `set -a; . docs/internal/ops.env; set +a`):

| Variable                     | What                                                               |
| ---------------------------- | ------------------------------------------------------------------ |
| `MONKIMONEY_SSH_HOST`        | SSH host (or `~/.ssh/config` alias) of the server: `<server>`      |
| `MONKIMONEY_GH_OWNER`        | GitHub account that owns the repository                            |
| `MONKIMONEY_GH_WORK_ACCOUNT` | Optional: the `gh` account to switch back to after an owner action |
| `SMOKE_BASE_URL`             | Production base URL, `https://<app-domain>`                        |

## Dokploy ids

Service ids live in the hosting panel and in `docs/internal/RUNBOOK-ids.md` (local only).

## GitHub

- Repo `MikePineda/monki-money`. Required checks on `main`: `ci` and
  `commitlint`; merge methods: merge commit (atomic commits) or squash.
- The protection lives as code in `.github/rulesets/main.json`. GitHub Free
  does not allow rulesets or branch protection on private repos, so it is
  applied once the repository is public (or on a paid plan), as the owner:

  ```bash
  .claude/skills/ship/scripts/gh-as-owner.sh api -X POST \
    repos/MikePineda/monki-money/rulesets --input .github/rulesets/main.json
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
.claude/skills/ship/scripts/wait-for-deploy.sh "$SMOKE_BASE_URL" "$(git rev-parse origin/main)"

# 2. Smoke as the smoke user: health, CSRF handshake, login, me, household,
#    accounts, categories, logout (Bruno, read-only in prod).
npm run smoke:prod

# 3. PWA files are never cached.
curl -sI "$SMOKE_BASE_URL/ngsw-worker.js" | grep -i 'cache-control\|cf-cache-status'
# expect: cache-control: no-cache, cf-cache-status: DYNAMIC or BYPASS
```

Expect 2 to 4 minutes from merge to live (build about 70 s, healthcheck
start period 60 s). Production still on the old sha after that means a
failed build or an automatic rollback: see "The two Dokploy traps".

Before the first push of Docker changes: `docker build --target runtime -t
monkimoney:local .` on your machine (see `CLAUDE.md` for running it).

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
`SENTRY_DSN_WEB`, `APP_DEFAULT_LOCALE` (optional, `en`), `SCHEDULER` (optional,
empty = on, `off` stops the monthly insights schedule and the push
notifications), `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`
(optional, see "Push notifications"), `MIGRATE_ON_START=true`,
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

A Dokploy scheduled backup of the Postgres service (`backup-create`) to an
S3-compatible destination (R2), prefix `monkimoney/`, at least daily, with
a retention count (the schedule and destination of a given deployment live
in the panel). Dokploy writes the objects under
`<postgres appName>/<prefix>/<timestamp>.sql.gz` (so `monkimoney-db-<suffix>/monkimoney/...`),
as `pg_dump -Fc` piped through gzip. Manual: `backup-manualBackupPostgres`.
List: `backup-listBackupFiles` only shows the top-level folder; to see the
files run `rclone lsjson -R --files-only` inside the Dokploy container with the
destination's S3 flags (`destination.one` has them; never print them). Restore:

```bash
gunzip -c <file>.dump.gz | docker exec -i $(docker ps -q -f name=monkimoney-db) \
  pg_restore -U monkimoney -d monkimoney --clean --if-exists --no-owner
```

A restore drill into `monkimoney_restore_test` is mandatory after the first
backup, and worth repeating after any Postgres major upgrade. Drill log:

- 2026-10-16: the first scheduled backup (15 Oct 16:15 UTC, 74 KB) streamed
  from R2 with `rclone cat | gunzip | pg_restore --no-owner --no-acl` into a
  fresh `monkimoney_restore_test` in 0.8 s; every count matched production
  (19 migrations, 20 tables, households, users, accounts, categories,
  transactions, import batches). The scratch database was dropped afterwards.

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

`APP_KEY` (invalidates every session, and the stored VAPID private key: rotate
the push keys right after, see "Push notifications"), `DB_PASSWORD`
(`postgres-changePassword`), R2 token, `LLM_API_KEY`, `RESEND_API_KEY`, Dokploy
API key, `SMOKE_PASSWORD`, the Cloudflare origin certificate (before it
expires).

## Certificate and Cloudflare

A Cloudflare origin certificate for `<app-domain>` is uploaded in Dokploy
Settings -> Certificates. What Cloudflare needs for this app:

- a proxied DNS record for `<app-domain>` and SSL **Full (strict)**;
- a **cache bypass** for the PWA files and the API: `/`, `/index.html`,
  `/ngsw-worker.js`, `/ngsw.json`, `/manifest.webmanifest`, `/i18n/*`,
  `/api/*` (otherwise installed apps stay pinned to an old build);
- Rocket Loader off (it rewrites the app's scripts);
- optionally, a rate limit on `/api/v1/auth/` on top of the app's own.

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
npm run smoke:prod       # against SMOKE_BASE_URL, after every deploy
```

Credentials: `SMOKE_EMAIL` and `SMOKE_PASSWORD` exported in the shell or in
`apps/api/bruno/.env` (gitignored); the production base URL is
`SMOKE_BASE_URL` (same places, or `docs/internal/ops.env`). Environments only
reference `{{process.env.*}}`. Against `prod` the collection only reads (plus the
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

1. Cloudflare dashboard (the account that owns `<app-domain>`) -> Turnstile
   -> add a widget for the app's hostname (managed mode) and copy the site
   key and the secret key.
2. Dokploy -> monkimoney-web -> Environment: set `TURNSTILE_SITE_KEY` and
   `TURNSTILE_SECRET`, then redeploy (start-first). `GET /api/v1/config`
   now returns `turnstileSiteKey`.
3. From then on the three endpoints answer 422 (`turnstileToken` /
   `turnstile`) without a valid widget token. The web renders the widget on
   login, sign-up and forgot password as soon as `GET /config` returns the
   site key (the submit button waits for the token), so set the site key
   first (or together with the secret), never the secret alone, or nobody
   can log in. To roll back, empty `TURNSTILE_SECRET` and redeploy.

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

The `pulse` skill runs this month's version from your machine, read-only and
together with health, logs, deployments, backups and disk:

```bash
ssh "$MONKIMONEY_SSH_HOST" 'docker exec -i $(docker ps -q -f name=monkimoney-db) \
  psql -U monkimoney -d monkimoney -X -q -v ON_ERROR_STOP=1 -f -' < .claude/skills/pulse/pulse.sql
```

Check the live endpoint with `node ace llm:smoke` inside the app container
(see `docs/llm.md`).

## Monthly insights schedule

**How it runs.** The web process starts an in-process scheduler in
production (`providers/scheduler_provider.ts`): first tick a minute after
boot, then every 15 minutes. On the 1st of each month, from 08:00 to
midnight in each household's time zone, it writes last month's AI summary
for every active household that had income or spending that month (transfers
do not count), in the household's language, through the same path as the
Generate button (quota check, one `llm_usage` row per call). A summary
someone tapped before the month ended (say on the 20th) covers part of the
month only, so it is replaced; one written after the month ended is kept.
Each household and month is claimed once in `scheduler_runs`, so overlapping
containers (start-first updates), restarts and manual runs never pay for it
twice. A run left unfinished for 30 minutes (container killed mid-run) is
taken over. Only a vendor failure (the model did not answer, nothing billed)
is retried, an hour later, 3 attempts at most; an unusable answer is final
(`failed:final`). Skips (no activity, quota used up, pending deletion, LLM not
configured, already generated) are logged and recorded once and never
retried. On shutdown the tick stops before the next household or model call
and gives back a claim it had not used yet. Cost: at most two billed calls per
household and month (the answer, plus the LLM layer's one retry when that
answer is unusable). Log lines:

```
monthly insights: household 12 2026-09 es: generated
monthly insights: household 31 2026-09 en: skipped (no activity)
```

**Disable.** `SCHEDULER=off` in the Dokploy environment, then redeploy.
Empty (the default) means on; it never runs in development, ace commands or
tests.

**By hand** (a 1st missed entirely, a household the scheduler gave up on, a
regenerate). It does not wait for 08:00, and the default month is the
previous month in each household's time zone. Without `--force` it claims the
scheduler's own row, so a household a tick already handled (or is handling)
answers "already run"; `--force` bypasses that lock and replaces even a
complete summary, only once the model answered (a failed regenerate keeps the
old one). Use `--force` for a household whose run failed or was skipped. One
line per household; exit code 1 when any failed.

```bash
ssh "$MONKIMONEY_SSH_HOST" 'docker exec $(docker ps -q -f name=monkimoney-web | head -n1) node ace insights:generate'
ssh "$MONKIMONEY_SSH_HOST" 'docker exec $(docker ps -q -f name=monkimoney-web | head -n1) node ace insights:generate --month 2026-09 --household 12 --force'
```

**Last runs** (outcome `generated`, `skipped:<reason>`, `failed` (retried),
`failed:final` or `released`, with the error):

```bash
ssh "$MONKIMONEY_SSH_HOST" 'docker exec -i $(docker ps -q -f name=monkimoney-db) psql -U monkimoney -d monkimoney -c "
  SELECT job, period_key, household_id, attempts, outcome, error, started_at, finished_at
  FROM scheduler_runs ORDER BY started_at DESC LIMIT 20;"'
```

## Push notifications

**What is sent.** Two Web Push notifications, both from the in-process
scheduler (production only, `SCHEDULER=off` stops them with the insights):

- **Summary ready** (`summary-ready-push`): in the tick that writes last
  month's summary (one written by `node ace insights:generate` at the next
  tick), every member with the switch on (the default) and a device gets
  "Your September summary is ready" in their own language, opening that
  month. Once per person and
  month (`scheduler_runs`, job + month + household + person), so a
  regenerated summary is never announced twice; a summary someone tapped is
  never announced. `monthly_insights.notified_at` marks the summary as told
  once nobody's push is left to retry; summaries older than a day are never
  announced.
- **Daily reminder** (`daily-reminder`, opt-in): once the household's local
  time passes the person's reminder time (20:00 by default) the local day
  is claimed (period key `YYYY-MM-DD`, per person) and "Did you log anything
  today?" goes out only when the person created nothing that day (quick
  add, receipt, import, transfer); otherwise the day is recorded as
  `skipped:logged-today`. No amounts, merchants or names in any payload.

Every send has a hard 10 s deadline (`PUSH_SEND_TIMEOUT_MS`): past it the
request is dropped and counts as a failure, so a slow push service never holds
up the tick. A push no device accepted is retried an hour later, 3 attempts at
most (the scheduler's rule); a 404/410 from the push service deletes that subscription,
any other failure adds one to `push_subscriptions.failures`. iPhone and iPad
only receive pushes in the installed app (iOS 16.4+); each person turns
notifications on per device in Settings → Notifications.

**Push services.** The API only stores and contacts endpoints on the hosts
listed in `PUSH_SERVICE_HOSTS` (`apps/api/app/domain/push/push_subscription.ts`):
`fcm.googleapis.com` (Chrome and every Chromium browser), `*.push.services.mozilla.com`
(Firefox), `*.push.apple.com` (Safari) and `*.notify.windows.com` (Edge on
Windows), https on the default port, never an IP literal; anything else is 422
`endpoint`/`pushEndpoint`. A browser on another push service cannot turn
notifications on until its host is added there (exact name, or a suffix
starting with a dot) with a test case in `tests/unit/push/push_subscription.spec.ts`.
Each person keeps at most 10 devices: registering an eleventh drops the least
recently registered one. The reminder time goes up to 23:30 (two ticks before
midnight).

**Keys.** Nothing to configure. On the first `GET /api/v1/config` the app
generates a VAPID key pair with `web-push` and stores it in `app_settings`
(`vapid_public_key` in clear, `vapid_private_key` encrypted with `APP_KEY`
through the app's encryption service); every container then reads the same
pair (two racing on the first boot converge on one). The subject is
`VAPID_SUBJECT` or `APP_URL` (https). To pin a pair of your own, set
`VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (both or neither, URL-safe base64:
`npx web-push generate-vapid-keys`) in the Dokploy environment; env keys win
over the stored ones.

**Rotating the stored keys** (after an `APP_KEY` rotation, which makes the
stored private key unreadable: `GET /config` then answers
`vapidPublicKey: null` and the log says `push: no VAPID key pair, push is
unavailable`; or to replace a pair). Subscriptions are bound to the key they
were made with, so drop them too; each device subscribes again by itself the
next time its person opens Settings (the web notices the new key):

```bash
ssh "$MONKIMONEY_SSH_HOST" 'docker exec -i $(docker ps -q -f name=monkimoney-db) psql -U monkimoney -d monkimoney' <<'SQL'
DELETE FROM app_settings WHERE key IN ('vapid_public_key', 'vapid_private_key');
DELETE FROM push_subscriptions;
SQL
# Then reload the service (application-reload): each process caches the pair.
```

**Test a push by hand.** Sends "Notifications work" (opening Settings) to
every device the user registered in their current household, through the
real push services; one line per device (`sent`, `gone (410), subscription
deleted`, `failed (...)`), exit code 1 when no device got it. It ignores the
person's switches and the scheduler. User ids are in `users`.

```bash
ssh "$MONKIMONEY_SSH_HOST" 'docker exec $(docker ps -q -f name=monkimoney-web | head -n1) node ace push:test --user 12'
```

**Last runs and devices:**

```bash
ssh "$MONKIMONEY_SSH_HOST" 'docker exec -i $(docker ps -q -f name=monkimoney-db) psql -U monkimoney -d monkimoney' <<'SQL'
SELECT job, period_key, household_id, user_id, attempts, outcome, error, finished_at
  FROM scheduler_runs WHERE job IN ('summary-ready-push', 'daily-reminder')
  ORDER BY started_at DESC LIMIT 20;
SELECT id, household_id, user_id, user_agent, failures, last_used_at
  FROM push_subscriptions ORDER BY id;
SQL
```

## Receipts storage

Receipt photos go from the browser straight to the bucket (`S3_BUCKET`)
under `receipts/<householdId>/` through presigned PUTs; the API reads each
one back for the scan and deletes it right away (flow in `docs/CONTRACTS.md`,
"Receipts and uploads"). Without `DRIVE_DISK=s3` uploads and scans answer 503
`E_STORAGE_UNAVAILABLE`; without `LLM_API_KEY` scans answer 503
`E_LLM_UNAVAILABLE`.

The bucket needs two settings. Set them once from inside the production
container (and again whenever `APP_URL` changes):

```bash
# Print the merged configuration only:
ssh "$MONKIMONEY_SSH_HOST" 'docker exec $(docker ps -q -f name=monkimoney-web | head -n1) node ace storage:configure --dry-run'
# Apply it:
ssh "$MONKIMONEY_SSH_HOST" 'docker exec $(docker ps -q -f name=monkimoney-web | head -n1) node ace storage:configure'
```

- **CORS**: the `APP_URL` origin may `PUT` with the `Content-Type` header
  (preflight cached for an hour). Without it the upload fails in the browser
  with a CORS error before reaching the bucket.
- **Lifecycle rule `expire-receipts`**: objects under `receipts/` expire after
  1 day: photos nobody scanned and photos whose delete failed (the API logs
  `receipt scan: could not delete the photo` at warn). Bank CSVs live under
  `imports/` and are not affected.

The command reads the current configuration and merges: other CORS rules and
other lifecycle rules (such as R2's default multipart-abort rule) stay, a
re-run changes nothing, and it prints the result, never credentials. Changing
bucket settings needs an R2 token with **Admin Read & Write**; with an
object-only token the command fails with `AccessDenied`. In that case set both
by hand in the dashboard (R2 → bucket → Settings → CORS policy / Object
lifecycle rules) or with wrangler from your machine (`npx wrangler r2 bucket cors
set <bucket> --file <rules.json>` and `npx wrangler r2 bucket lifecycle add
<bucket> expire-receipts receipts/ --expire-days 1`; check the flags with
`--help`, they change between wrangler versions).

Verify (S3 API with the R2 token, or wrangler):

```bash
aws s3api get-bucket-cors --bucket <bucket> --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com
aws s3api get-bucket-lifecycle-configuration --bucket <bucket> --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com
npx wrangler r2 bucket cors list <bucket>
npx wrangler r2 bucket lifecycle list <bucket>
```

Locally, MinIO has no bucket CORS (it allows every origin): the command sets
only the lifecycle rule and says so. Presigned URLs point at `S3_ENDPOINT`, so
the browser must reach that host (`http://127.0.0.1:9030` in development).

## Disk

Keep Docker's data root (images, volumes, build cache) on a disk with room
to grow; the system disk of small cloud instances fills up fast. Watch the
build cache (`dockerDiskUsage-getBuildCache`) and keep Dokploy's weekly
Docker cleanup on.
