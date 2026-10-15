---
name: pulse
description: Read-only production health report for monkimoney - deployed version and sha, service replicas, recent errors in the logs, last Dokploy deployments, R2 backups, server disk, app activity and LLM usage/cost - summarized on one screen. Use when asked "/pulse", "how's the app doing?", "¿cómo va la app?", "¿qué show con monkimoney?", "is prod healthy?", or about production errors, backups, disk or LLM spend.
---

# monkimoney pulse: how is production doing?

Answer with MEASUREMENTS, never from memory. Everything here is
**read-only**: never deploy, restart, roll back, run a backup or write
anything while running this skill. If something needs action, report it
with the evidence and let the owner decide (the `ship` skill has the
rollback path).

Ids come from `docs/RUNBOOK.md` → "Dokploy ids": `applicationId` of
`monkimoney-web`, the R2 backup `destinationId`. The server is
`ssh <server>`. Every HTTP request to production needs a browser
User-Agent: Cloudflare's Browser Integrity Check answers 403 otherwise.

## 1. Deployed version

```bash
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
curl -s -A "$UA" https://app.example.com/api/health
git fetch origin && git rev-parse origin/main
```

`status` must be `ok` with `database` and `memory_heap` checks `ok`
(`memory_heap` warns at 80% of the heap). Compare `sha` with `origin/main`:
equal is healthy; `main` ahead by a few minutes is a build in flight;
ahead for long means a failed build or an automatic rollback (step 3).

## 2. Services

```bash
ssh <server> 'docker service ls --filter name=monkimoney'
```

`monkimoney-web-*` and `monkimoney-db-*` must both be `1/1`. `0/1` on the
web service is a boot crash (env var or migration): read the logs.

## 3. Last deployments

Dokploy MCP `deployment-all {applicationId}`: the newest five with status,
title and time. Flag any `error`. A failure about a second after the start
is the `--target` trap (the Dockerfile's final stage must stay `runtime`).

## 4. Errors (last 24 hours)

Logs are pino JSON on stdout: level 50 = error, 60 = fatal (40 = warn).

```bash
ssh <server> 'docker service logs $(docker service ls -q --filter name=monkimoney-web) \
  --since 24h --raw --no-color 2>&1 | grep -E "\"level\":(50|60)" | tail -40'
```

Fallback without ssh: `application-readLogs {applicationId, since: "24h",
tail: 2000}` and look for `"level":50` / `"level":60`. Group repeated errors
and give a one-line diagnosis when the cause is clear. Secrets, cookies and
emails are redacted by the logger; never paste a raw line that still shows
personal data into the report. Sentry is the owner's dashboard: mention it,
do not query it.

## 5. Backups (R2)

Dokploy MCP `backup-listBackupFiles {destinationId, search: "monkimoney/"}`.
The schedule is daily at 16:15 UTC (02:15 Brisbane), keeping 60. Flag a
newest file older than about 25 hours, a file much smaller than its
neighbours, or no files at all. Note the date of the last restore drill
(RUNBOOK "Backups, restore and drill"); flag it if it was never done.

## 6. Disk

```bash
ssh <server> 'df -h / /mnt/data'
```

Docker and the database volume live on `/mnt/data`; `/` is small and always
tight, so flag growth there, not the baseline. Flag either above about 80%.
If `/mnt/data` grows, `dockerDiskUsage-getBuildCache` shows whether the
build cache is the culprit (Dokploy's weekly cleanup should keep it down).

## 7. Activity and LLM usage (database, read-only)

```bash
ssh <server> 'docker exec -i $(docker ps -q -f name=monkimoney-db) \
  psql -U monkimoney -d monkimoney -X -q -v ON_ERROR_STOP=1 -f -' < .claude/skills/pulse/pulse.sql
```

`pulse.sql` (next to this file) opens a read-only transaction and prints
aggregates only: households by status, users (verified, new in 7 days),
accounts, transactions created (24 h / 7 d, once the ledger exists) and
`llm_usage` (once the LLM package is deployed): this month's calls, failures,
tokens, latency and cost per household and purpose, the last 24 hours by
status and the last three failures. Missing tables print a "not created
yet" line instead of failing. If a migration renames those columns, update
the SQL with it.

Flag: LLM failures above about 10% of calls, cost climbing faster than
usage, a household near its monthly cap, latency well above a few seconds.
Do not flag quiet days (no transactions is not an outage) or the "Smoke"
household's rows (the post-deploy smoke user).

## 8. Report (one screen)

Lead with a one-line verdict, then one line per area. Answer in the
language the user wrote in. Shape:

```
monkimoney: healthy (v0.1.0, sha 980b2f0 = origin/main)
- health: ok (db ok, heap ok); web 1/1, db 1/1
- deploys: last 3 done, newest 2026-10-15 22:40 UTC
- errors 24h: none (or: 3x E_... in import, first at ...)
- backups: 12 in R2, newest 2026-10-15 16:15 UTC (6 h old)
- disk: / 71%, /mnt/data 38%
- activity: 1 household, 2 users, 4 accounts; 37 transactions in 7 d
- LLM this month: 120 calls, 2 failed, $0.41
- action: none (or the one thing the owner should look at)
```

Rules: emails and names never go into repo files, commits or the backlog;
if `ssh <server>` fails, report the error and keep going with the
sections that do not need it (health, Dokploy MCP); no workarounds.
