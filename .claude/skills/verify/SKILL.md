---
name: verify
description: Run the full monkimoney gate (`npm run verify`: lint, typecheck, unit + functional tests, build, Playwright E2E), summarize failures by layer, and refuse to open a pull request while anything is red. Use before any PR, when asked to "verify", "run the gate", "is it green?", "check everything", or before reporting a work package as done.
---

# verify

The PR gate for this repo. Nothing gets a pull request while it is red.

## Steps

1. Preconditions, fix silently if needed:
   - Node 24: `source ~/.nvm/nvm.sh && nvm use 24`.
   - Docker running; dev stack up for the Japa suite: `docker compose up -d`
     (Postgres on 5432 with the `monkimoney_test` database).
   - Generated contract in sync: `npm run codegen`, then check
     `git status apps/api/.adonisjs` (commit any change with the code that caused it).
2. Run `npm run verify` from the repo root. It runs
   `turbo run lint typecheck test build` and then `npm run e2e`
   (ephemeral `docker-compose.test.yml` on the first free E2E slot, 5433/9100
   for slot 0, Playwright on `mobile-chromium` and `mobile-webkit`; other
   worktrees running E2E at the same time get other slots). For a quicker loop while iterating
   use `npm run verify:quick` (no E2E), but the final answer needs the full run.
3. Summarize by layer, in this order, one line each with the failing
   package/test names: **lint**, **typecheck**, **unit** (Japa `unit`, Vitest
   domain, shared `node:test`), **functional** (Japa `functional`), **build**,
   **e2e** (spec + project). Quote only the first relevant error per failure.
4. Verdict:
   - All green: say so and allow the PR.
   - Anything red: **do not open or update a pull request**, do not push to
     `main`. Report the failures and the likely cause; fix them if that is in
     scope, then run the gate again.

## Notes

- Flaky E2E? First check leftovers of your own run: the script prints its
  slot; `docker compose -p <project> -f docker-compose.test.yml down -v`
  removes that slot's stack (`monkimoney-test` for slot 0). Never tear down
  another run's project.
- Turbo caches lint/typecheck/build; tests and E2E never cache. `--force`
  reruns everything.
- Never "fix" a red gate by skipping, deleting or loosening a test without the
  owner's explicit approval.
