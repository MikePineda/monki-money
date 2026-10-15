# Runbook

Operations for production (`https://app.example.com`, Dokploy on the Oracle
ARM server). Fill the TODOs as the infrastructure work packages land.

## Dokploy ids

| What               | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| Project            | `monkimoney` (TODO: projectId, environmentId)                   |
| Postgres service   | `monkimoney-db` (TODO: postgresId, appName)                     |
| Application        | `monkimoney-web` (TODO: applicationId, appName)                 |
| Domain             | `app.example.com`, https, `certificateType: none`, port 3333 |
| GitHub provider    | App `dokploy-<server>` (TODO: githubId)                      |
| Backup destination | R2, prefix `monkimoney/` (TODO: destinationId, backupId)        |

## Deploy and verification

Merge to `main` -> Dokploy webhook -> ARM64 build on the server (target
`runtime`) -> Swarm start-first update with rollback. Then:

```bash
curl -s https://app.example.com/api/health | jq '{status, version, sha}'
curl -sI https://app.example.com/ngsw-worker.js | grep -i 'cache-control\|cf-cache-status'
# expect: cache-control: no-cache, cf-cache-status: DYNAMIC or BYPASS
```

Before the first push of Docker changes: `docker build --target runtime -t
monkimoney:local .` on the Mac (see `CLAUDE.md` for running it).

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
`SENTRY_DSN_WEB`, `MIGRATE_ON_START=true`, `SEED_USERS` (first deploy only),
`SEED_HOUSEHOLD`, `SEED_USERS_JSON`, `SEED_ACCOUNTS`, `SMOKE_PASSWORD`.

## Backups, restore and drill

TODO (infra package): Dokploy `backup-create` for `monkimoney-db` to the R2
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

- Rollback: Dokploy `rollback-rollback` (or redeploy a previous commit).
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

## Smoke test (Bruno)

TODO (E2E/Bruno package): `bru run --env prod` from `apps/api/bruno` with
`SMOKE_PASSWORD` in the environment.

## Opening registration

`REGISTRATION_OPEN=true` + redeploy (start-first), with Turnstile, Sentry,
rate limits and email verification active.

## LLM cost

TODO (LLM package): query over `llm_usage` per household and month.

## Disk

The server's `/` is small; Docker lives on `/mnt/data`. Watch the build cache
(`dockerDiskUsage-getBuildCache`) and keep Dokploy's weekly Docker cleanup on.
