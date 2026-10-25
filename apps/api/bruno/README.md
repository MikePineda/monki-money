# Bruno collection

Living docs of the API, the post-deploy smoke test and a CI check. Plain-text
`.bru` files, versioned with the code. The contract itself is the Tuyau
registry (`docs/CONTRACTS.md`); this collection proves a running stack
answers it, and every request's `docs` block says what the route takes and
returns.

## Two tiers

The tiers are the two top-level folders. `bru run <folder>` selects one;
`bru run` with no path runs the whole collection, folders first, each in its
`seq` order (`folder.bru`), then the requests of a folder by `seq`.

| Folder   | Tier      | Where it runs                     | What it does                                                                    |
| -------- | --------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `smoke/` | read-only | production, local, CI             | 9 requests: probes, CSRF handshake, the smoke user's login, three reads, logout |
| `full/`  | full      | local and CI only (never in prod) | every resource of the API: creates, reads, edits, deletes, then cleans up       |

`full/` has one folder per resource, in dependency order:

| Folder            | Requests | Routes                                                                                                              |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `01-session`      | 12       | config (run setup), login, me, sign-up, forgot password, email verify/code/resend, profile, notification settings   |
| `02-household`    | 14       | household show/update/members, invitations, export (JSON and CSV), refusals of create/leave/transfer/delete/restore |
| `03-accounts`     | 8        | accounts CRUD, reorder, cards (two accounts kept for the run: A everyday, B wallet)                                 |
| `04-categories`   | 10       | categories and groups CRUD and reorder (and the taxonomy ids later folders use)                                     |
| `05-transactions` | 11       | create (and its `clientId` replay), quick add, suggestions, list filters, show, update, splits, bulk categorize     |
| `06-transfers`    | 3        | create, show, update                                                                                                |
| `07-payslips`     | 6        | create (with the transfer of the net), list, candidates, delete, the transfer's delete                              |
| `08-reports`      | 4        | month, trend, category, balances                                                                                    |
| `09-tags`         | 2        | list, show                                                                                                          |
| `10-goals`        | 7        | goals CRUD, projection, reorder                                                                                     |
| `11-insights`     | 2        | generate, show (fake LLM in the E2E stack; 503 without an LLM)                                                      |
| `12-imports`      | 10       | upload a synthetic NAB CSV, list, show, decide a row, bulk undo, classify, cancel, upload again, confirm            |
| `13-rules`        | 5        | rules CRUD, apply                                                                                                   |
| `14-recurring`    | 6        | list, merchants, create, update, detect, delete                                                                     |
| `15-devices`      | 6        | uploads presign, receipt scan (404: nothing uploaded), push subscribe twice, unsubscribe twice                      |
| `99-teardown`     | 8        | deletes the run's rows and accounts, `logout-all`, then `me` answers 401                                            |

### Run it

```bash
npm run smoke:prod      # smoke tier against SMOKE_BASE_URL (production), after every deploy
npm run smoke:local     # both tiers against http://localhost:3333 (npm run dev), as the smoke user
npm run smoke:e2e       # both tiers against a running E2E stack (what CI runs)
npm run bruno:coverage  # every route has a request (no stack needed)
```

All three call `scripts/smoke.sh <target>`, which runs a pinned
`@usebruno/cli` (no workspace dependency). Extra arguments go to `bru run`:

```bash
bash scripts/smoke.sh local smoke                    # only the smoke tier, locally
bash scripts/smoke.sh local full/05-transactions     # one folder (it needs the earlier ones' variables)
bash scripts/smoke.sh e2e --reporter-html /tmp/bruno.html
```

- `prod` runs only `smoke/`, with `--bail` (the first failure stops the
  run).
- `local` and `e2e` run the whole collection without `--bail`, so the
  teardown still runs after a failure. The full tier's login stops the run
  (`bru.runner.stopExecution()`) before any write unless it landed in the
  expected household.
- `e2e` is `--env local` with `baseUrl=http://127.0.0.1:$E2E_API_PORT`
  (default 3334, slot 0 of `scripts/e2e.sh`) and `smokeHousehold=E2E`, as the
  E2E seed's synthetic owner (`apps/api/app/services/e2e/e2e_seed.ts`) unless
  `SMOKE_EMAIL` / `SMOKE_PASSWORD` say otherwise.

Against an E2E stack by hand (the steps of the CI job, with slot 0 ports):

```bash
npx turbo run build --filter=@monkimoney/api
docker compose -f docker-compose.test.yml up -d --wait db minio
docker compose -f docker-compose.test.yml run --rm minio-init
mkdir -p apps/api/build/tests/fixtures && cp -R apps/api/tests/fixtures/llm apps/api/build/tests/fixtures/
(set -a; source e2e/e2e.env; set +a
 export PORT=3334 APP_URL=http://127.0.0.1:3334 DB_PORT=5433 S3_ENDPOINT=http://127.0.0.1:9100
 cd apps/api/build && node ace migration:run --force && node ace seed:e2e && node bin/server.js) &
npm run smoke:e2e
docker compose -f docker-compose.test.yml down -v
```

### Production safety

1. `npm run smoke:prod` runs `bru run smoke --env prod`: the full tier is
   not even loaded.
2. `full/folder.bru` skips every request of the full tier when the
   environment is `prod` (a hand-run `bru run --env prod`).
3. `collection.bru` skips any write in `prod` other than the smoke user's
   own login and logout.
4. `smoke/04-login` fails (and `--bail` stops the run) unless the user landed
   in the "Smoke" household; in `prod` that name is fixed in the test, not
   read from a variable.

## Variables

| Variable                             | Where                            | What                                                                                                   |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `baseUrl`                            | `environments/*.bru`             | `http://localhost:3333` (local), `{{process.env.SMOKE_BASE_URL}}` (prod), overridable with `--env-var` |
| `smokeEmail`, `smokePassword`        | `environments/*.bru`             | `{{process.env.SMOKE_EMAIL}}` / `SMOKE_PASSWORD`: never a literal in a `.bru` file                     |
| `smokeHousehold`                     | `environments/*.bru`             | the household the user must land in: `Smoke` (`E2E` through `--env-var`)                               |
| `xsrfToken`                          | runtime (`collection.bru`)       | the newest `XSRF-TOKEN` cookie, sent back as `X-XSRF-TOKEN`                                            |
| `runId`, `runWord`                   | runtime (`01-session/01-config`) | base-36 timestamp (and a letters-only copy for merchant keys) in every name the run creates            |
| `today`, `month`                     | runtime (`01-session/01-config`) | UTC date and month of the run (never ahead of the household's Australian time zone)                    |
| ids (`accountAId`, `expenseId`, ...) | runtime (post-response scripts)  | chained from the request that creates the row to the ones that read, edit and delete it                |

Credentials: `SMOKE_EMAIL` and `SMOKE_PASSWORD`, exported in the shell or
written to `apps/api/bruno/.env` (gitignored; Bruno loads it as
`process.env`). The `prod` environment's `baseUrl` is
`{{process.env.SMOKE_BASE_URL}}` (`https://<app-domain>`, no trailing slash):
the repository never names the production domain. Set it the same way (shell
or `apps/api/bruno/.env`); `scripts/smoke.sh prod` also reads it from
`docs/internal/ops.env` and stops with a clear message when it is missing.
Personal overrides go in `environments/*.local.bru` (gitignored).

The smoke user is created by the production bootstrap seeder when
`SMOKE_EMAIL` / `SMOKE_PASSWORD` are set with `SEED_USERS=true`: verified,
alone in its own household "Smoke", no accounts. Locally:

```bash
# apps/api/.env: SEED_USERS=true, SMOKE_EMAIL=smoke@local.test, SMOKE_PASSWORD=<10+ chars>
(cd apps/api && node ace db:seed --files=./database/seeders/production_bootstrap_seeder.ts)
```

## Rules every request follows

1. **Browser-like `User-Agent`.** Cloudflare's Browser Integrity Check
   answers 403 to clients that do not look like a browser (python-urllib
   did). `collection.bru` sets a Chrome User-Agent and
   `Accept: application/json` on every request; do not override them.
2. **CSRF: GET first, then `X-XSRF-TOKEN`.** The API sets the `XSRF-TOKEN`
   cookie on every response; the collection's post-response script stores
   the newest value in `xsrfToken`. Every write sends it back: the smoke
   writes set the header themselves, the full tier sets it once in
   `full/folder.bru`. Each tier starts with a GET of `/api/v1/config`.
   Without it the API answers 403 `E_BAD_CSRF_TOKEN`. Cookies (session and
   XSRF) are kept by the CLI's cookie jar for the whole run.
3. **The smoke tier is read-only.** Nothing in `smoke/` writes business
   data; it runs in production after every deploy.
4. **The full tier is self-contained and idempotent.** It creates what it
   reads (two accounts, transactions, a transfer, a payslip, a goal, a rule,
   a recurring item, a push subscription, an import), names everything with
   `runId`, and deletes it again (in its own folder or in `99-teardown`), so
   a second run on the same database passes too. Destructive routes
   (household delete, leave, ownership transfer, restore, a second household)
   are shown through the refusal that changes nothing. Two things stay: a
   generated month insight (no delete route; `force` replaces it) and what
   `recurring.detect` upserts (it also runs after every confirmed import).
   An aborted run (Ctrl-C) can leave rows named `Bruno ... <runId>` behind:
   reset the E2E stack, or delete them in the app.
5. **Household-agnostic assertions.** The full tier passes in the empty
   "Smoke" household and in the seeded "E2E" one; where they differ (the E2E
   household is full, so an invitation answers 402) the test accepts both
   documented answers.
6. **Mind the throttles.** 5 failed logins per minute per IP + email block
   that pair for 20 minutes (429): fix a wrong `SMOKE_PASSWORD` before
   retrying. `auth.email.resend` allows 3 per 15 minutes per user (its test
   accepts the 429), sign-up 5 per minute per IP, invitation mails 10 an
   hour per household.

## Add a request

1. Put it in the folder of its resource (`full/<NN-resource>/`; `smoke/`
   only for a read that must run in production), as `NN-name.bru` with the
   next `seq` (keep the file prefix and `seq` equal). Copy a neighbour for
   the shape:

   ```
   meta {
     name: Account
     type: http
     seq: 4
   }

   get {
     url: {{baseUrl}}/api/v1/accounts/{{accountAId}}
     body: none
     auth: none
   }

   assert {
     res.status: eq 200
     res.body.data.id: eq {{accountAId}}
   }

   docs {
     `accounts.show`: what it takes and returns (from docs/CONTRACTS.md).
   }
   ```

2. Chain ids with `script:post-response` (`bru.setVar('thingId',
res.body.data.id)`) and use them as `{{thingId}}`. Whatever the request
   creates is deleted later in the same folder or in `99-teardown` (with
   a `skipRequest()` guard when the id is missing).
3. Assert the contract, not incidental data: status, the `{ data }` shape,
   invariants. `tests { }` with `expect` covers what an `assert` line cannot
   express. Scripts run in Bruno's safe sandbox (no `require`).
4. Run `npm run bruno:coverage` and `npm run smoke:e2e` (or `smoke:local`),
   then commit the `.bru` file with the route change that needed it.

## Coverage check

`npm run bruno:coverage` (`scripts/bruno-coverage.mjs`, also a step of the
CI `bruno` job) reads the route list from the generated Tuyau registry
(`apps/api/.adonisjs/client/registry/index.ts`) and the method and URL of
every `.bru` file, and fails when:

- a route has no request and is not in the script's `ALLOWLIST`;
- a request matches no route (a renamed or removed route, a typo);
- an allowlist entry is stale (the route is gone or now has a request).

A new route therefore fails CI until it gets a request.
`node scripts/bruno-coverage.mjs --scaffold <dir>` also writes a skeleton
`.bru` for each uncovered route (method, URL with `{{param}}` variables, a
status assertion and a TODO docs block) to fill in and move into its folder.

Allowlisted (they need a secret that only arrives by email, and a made-up
one burns the per-IP failure budget): `auth.password.reset`,
`auth.invitations.show`, `auth.invitations.accept`. The SPA fallback and
the test-support routes (`/api/test/*`) are not in the registry at all.

## Running `bru` by hand

`bru run` only works with the collection root as the working directory, and
`npx` inside this npm workspace switches the working directory to
`apps/api`, so `npx @usebruno/cli run ...` fails with "You can run only at
the root of a collection". Use the npm scripts, or a global install:

```bash
npm i -g @usebruno/cli@4.2.0
cd apps/api/bruno && bru run smoke --env prod --bail
bru run smoke/01-health.bru --env prod   # a single request
```

The Bruno desktop app opens the same folder (Open Collection →
`apps/api/bruno`); pick the environment in the top-right corner.
