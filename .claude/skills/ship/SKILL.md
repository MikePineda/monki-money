---
name: ship
description: Take a monkimoney branch to production with guardrails - Conventional commit, the full `npm run verify` gate, push, pull request as the repo owner, green checks, merge (= deploy), wait until /api/health reports the new sha, Bruno smoke against production, report. Includes the rollback path and the Dokploy traps. Use when asked to "/ship", "ship it", "deploy", "súbelo", "mándalo a producción", "merge and deploy", or to get a finished work package live on app.example.com.
---

# ship: from a branch to app.example.com

The contract: nothing reaches `main` without `npm run verify` green and the
CI checks green, and nothing is called "shipped" until production reports
the merge commit and the smoke run passes. **Merge = deploy**: Dokploy
builds `main` on the server (ARM64, target `runtime`) and does a Swarm
start-first update with automatic rollback.

Ids (applicationId, R2 destination, service names) live in
`docs/RUNBOOK.md` → "Dokploy ids". Every `node`/`npm` command needs Node 24
(`source ~/.nvm/nvm.sh && nvm use 24`).

## 1. What is shipping

```bash
git status --short && git log --oneline origin/main..HEAD && git diff --stat origin/main...HEAD
```

Never ship from `main` (no direct pushes; branch first). Summarize the
change in user terms. Stop and ask the owner before merging when the diff
has any of these:

- A migration that is not additive (drop, rename, type change). Swarm runs
  the old and new version side by side for seconds; the old code must still
  work on the new schema.
- A new **required** variable in `apps/api/start/env.ts`: it must be in the
  Dokploy panel before the merge, or the new task crashes at boot (`0/1`).
- Changes to auth, sessions, CSRF, tenant scoping or the PWA cache headers.

## 2. Commit

Conventional Commits (commitlint runs in the hook and in CI; types drive
release-please, so `feat`/`fix`/`security` change the version). One logical
change per commit, English, body explaining why. End every message with the
attribution trailers this session's instructions give (for agents:
`Co-Authored-By: ...` and `Claude-Session: ...`). Never `--no-verify`.

## 3. Sync and gate

```bash
git fetch origin && git merge origin/main      # merge commits are the house style; never rebase a pushed branch
npm run verify                                  # lint, typecheck, Japa, Vitest, build, Playwright E2E
```

Use the `verify` skill to run and summarize it. Red = stop: fix (in scope)
or report; never skip, delete or loosen a test to get green. The gate runs
on the merged tree: if `main` moves again before step 6, sync and re-run.

## 4. Push and open the pull request

```bash
git push -u origin <branch>
```

The repo is private under the owner's GitHub account; the default `gh`
account on this machine is the work one. `scripts/gh-as-owner.sh` (next to
this file) switches to `MikePineda`, runs one `gh` command and always
switches back, even on failure:

```bash
S=.claude/skills/ship/scripts
$S/gh-as-owner.sh pr create --repo MikePineda/monki-money --base main --head <branch> \
  --title "<conventional title>" --body-file <file>
```

By hand it is exactly:

```bash
gh auth switch --hostname github.com --user MikePineda
gh pr create --repo MikePineda/monki-money --base main --head <branch> --title "..." --body-file <file>
gh auth switch --hostname github.com --user <work-account>
```

The body says what changed, why, how it was verified (`npm run verify`
output summary) and anything the owner must do (panel env vars). End it
with the PR attribution line this session's instructions give.

## 5. Wait for checks

```bash
$S/gh-as-owner.sh pr checks <number> --repo MikePineda/monki-money --watch --fail-fast --interval 20
```

`ci`, `commitlint` and `gitleaks` must be green. `e2e` is still
non-blocking in CI (`continue-on-error`); local `npm run verify` already ran
it, but a red CI `e2e` is worth a line in the report. A red required check
stops the ship: read it with
`$S/gh-as-owner.sh run view <run-id> --repo MikePineda/monki-money --log-failed`.
Never merge red, never `--admin`.

## 6. Merge (= deploy)

```bash
$S/gh-as-owner.sh pr merge <number> --repo MikePineda/monki-money --merge --delete-branch
git fetch origin && git rev-parse origin/main      # the merge commit = the sha to wait for
```

`--merge` keeps atomic commits (use `--squash` for a single-change PR). Do
not merge the release-please PR as part of a ship; it is its own deploy.

## 7. Wait for the new build

Build about 70 s plus a start-first rollout (healthcheck start period 60 s):
expect 2 to 4 minutes.

```bash
$S/wait-for-deploy.sh https://app.example.com "$(git rev-parse origin/main)" 900 15
```

It polls `GET /api/health` with a browser User-Agent until `sha` equals the
merge commit and `status` is `ok`. On timeout, diagnose before retrying
anything (Dokploy MCP, applicationId from the RUNBOOK):

- `deployment-all {applicationId}`: the newest deployment's status and log
  path. `error` within about a second of starting = **the `--target` trap**:
  Dokploy always builds with `--target`, so the Dockerfile's final stage
  must stay named `runtime`.
- Build `done` but production still on the old sha = **boot crash**: the
  service sits at `0/1` replicas and Swarm rolled back. Read
  `application-readLogs {applicationId, since: "15m", tail: 300}`: a missing
  env var (`start/env.ts` validates at boot), a failing migration
  (`MIGRATE_ON_START`) or a seeder error (`SEED_USERS`). Fix forward with a
  new PR; never "retry until green".
- No deployment at all: the push webhook did not fire. `application-deploy
{applicationId}` builds `main` once (autoDeploy should be on).

## 8. Smoke production

```bash
npm run smoke:prod
curl -sI https://app.example.com/ngsw-worker.js | grep -i 'cache-control\|cf-cache-status'
```

`smoke:prod` runs the Bruno collection (`apps/api/bruno`) as the smoke user,
reads only, logs out; it needs `SMOKE_EMAIL` / `SMOKE_PASSWORD` in the shell
or in `apps/api/bruno/.env` (gitignored). The service worker must answer
`cache-control: no-cache` and `cf-cache-status: DYNAMIC` or `BYPASS`.
Every request to production carries a browser User-Agent (Cloudflare's
Browser Integrity Check answers 403 otherwise) and every write sends
`X-XSRF-TOKEN` from a cookie received on a GET; the collection does both.

## 9. Report

One screen: PR number and title, merge sha, time from merge to live,
`/api/health` version and sha, smoke result (requests / assertions), the
PWA header check, and anything flagged on the way (red CI `e2e`, slow build,
env vars the owner must add). Answer in the language the user wrote in.

## Rollback

Migrations are additive, so the previous image runs fine on the new schema.

1. **Automatic**: if the new task never turns healthy, Swarm already rolled
   back (`FailureAction: rollback`). Production keeps the old sha; fix
   forward.
2. **New build is live but broken** (smoke red, errors in the logs):
   - Dokploy rollback: `deployment-all {applicationId}` lists deployments;
     when rollbacks are enabled for the application (`application-one`
     shows it; Dokploy keeps the previous images only then), call
     `rollback-rollback {rollbackId}` for the last good deployment, or use
     the panel: Application → Deployments → previous deployment → Rollback.
   - Always available: revert the merge and ship the revert.
     `git switch -c revert/<topic> origin/main && git revert -m 1 <merge-sha>`,
     then steps 2 to 8 (the gate still applies; it is fast because only the
     revert changed).
3. After any rollback, confirm with `wait-for-deploy.sh` (old sha) and
   `npm run smoke:prod`, then tell the owner what happened.

## Guardrails

- Never push to `main`, never `--no-verify`, never `--admin`, never merge
  with a red required check, never skip or weaken a test to ship.
- The `gh` account always goes back to the work account (the script's trap
  does it; by hand, run the switch back even after an error).
- Production is touched only by reads: health, the smoke user's read-only
  collection, Dokploy reads. Writes to production data are never part of a
  ship.
