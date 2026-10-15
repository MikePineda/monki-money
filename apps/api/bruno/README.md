# Bruno smoke collection

Living docs of the API and the post-deploy smoke test. Plain-text `.bru`
files, versioned with the code. The contract itself is the Tuyau registry
(`docs/CONTRACTS.md`); this collection proves a deployed stack answers it.

| Request          | What it proves                                                        |
| ---------------- | --------------------------------------------------------------------- |
| `01-health`      | `GET /api/health`: 200, `status: ok`, database up, `version` + `sha`  |
| `02-health-live` | `GET /api/health/live`: the process answers                           |
| `03-config`      | `GET /api/v1/config`, and the CSRF handshake (`XSRF-TOKEN` cookie)    |
| `04-login`       | `POST /api/v1/auth/login` as the smoke user, who must land in "Smoke" |
| `05-me`          | `GET /api/v1/auth/me`: session, membership, entitlements              |
| `06-household`   | `GET /api/v1/household`: the household context middleware             |
| `07-accounts`    | `GET /api/v1/accounts`: a household-scoped list (empty for the smoke) |
| `08-categories`  | `GET /api/v1/categories?tree=1`: the seeded taxonomy                  |
| `09-logout`      | `POST /api/v1/auth/logout`: 204, no session left behind               |

## Run it

```bash
npm run smoke:local     # against http://localhost:3333 (npm run dev)
npm run smoke:prod      # against SMOKE_BASE_URL (production), after every deploy
```

Both call `scripts/smoke.sh <env>`, which runs a pinned `@usebruno/cli` with
`--bail` (the first failure stops the run). Extra flags pass through, for
example `bash scripts/smoke.sh local --reporter-junit /tmp/smoke.xml`.

Credentials: `SMOKE_EMAIL` and `SMOKE_PASSWORD`, exported in the shell or
written to `apps/api/bruno/.env` (gitignored; Bruno loads it as
`process.env`). Environments only reference them
(`{{process.env.SMOKE_EMAIL}}`); never type a secret into a `.bru` file.

The `prod` environment's `baseUrl` is `{{process.env.SMOKE_BASE_URL}}`
(`https://<app-domain>`, no trailing slash): the repository never names the
production domain. Set it the same way (shell or `apps/api/bruno/.env`);
`scripts/smoke.sh prod` also reads it from `docs/internal/ops.env` and stops
with a clear message when it is missing. `local` stays on
`http://localhost:3333`.
Personal overrides go in `environments/*.local.bru` (gitignored).

The smoke user is created by the production bootstrap seeder when
`SMOKE_EMAIL` / `SMOKE_PASSWORD` are set with `SEED_USERS=true`: verified,
alone in its own household "Smoke", no accounts. Locally:

```bash
# apps/api/.env: SEED_USERS=true, SMOKE_EMAIL=smoke@local.test, SMOKE_PASSWORD=<10+ chars>
(cd apps/api && node ace db:seed --files=./database/seeders/production_bootstrap_seeder.ts)
```

### Running `bru` by hand

`bru run` only works with the collection root as the working directory, and
`npx` inside this npm workspace switches the working directory to
`apps/api`, so `npx @usebruno/cli run ...` fails with "You can run only at
the root of a collection". Use the npm scripts, or a global install:

```bash
npm i -g @usebruno/cli@4.2.0
cd apps/api/bruno && bru run --env local --bail
bru run 01-health.bru --env prod   # a single request
```

The Bruno desktop app opens the same folder (Open Collection →
`apps/api/bruno`); pick the environment in the top-right corner.

## Rules every request follows

1. **Browser-like `User-Agent`.** Cloudflare's Browser Integrity Check
   answers 403 to clients that do not look like a browser (python-urllib
   did). `collection.bru` sets a Chrome User-Agent and
   `Accept: application/json` on every request; do not override them.
2. **CSRF: GET first, then `X-XSRF-TOKEN`.** The API sets the `XSRF-TOKEN`
   cookie on every response; the collection's post-response script stores
   the newest value in the runtime variable `xsrfToken`. Every POST, PUT,
   PATCH and DELETE (login and logout included) sends
   `X-XSRF-TOKEN: {{xsrfToken}}` and must run after a GET (`03-config`).
   Without it the API answers 403 `E_BAD_CSRF_TOKEN`. Cookies (session and
   XSRF) are kept by the CLI's cookie jar for the whole run.
3. **Production is read-only.** Against `prod` the collection only reads,
   plus the smoke user's own login and logout. The collection's pre-request
   script skips any other write when the environment is `prod`, so a write
   request runs locally and is reported as skipped in production.
4. **The smoke user never touches the real household.** `04-login` fails
   (and `--bail` stops the run before any read) unless the user landed in
   the "Smoke" household.
5. **Mind the login throttle.** 5 failed logins per minute per IP + email
   block that pair for 20 minutes (429). Fix a wrong `SMOKE_PASSWORD`
   before retrying.

## Add a request

1. Create `NN-name.bru` at the collection root with the next `seq` (keep the
   file prefix and `seq` equal; logout stays last, so renumber it if you add
   after `08`). Copy an existing file for the shape:

   ```
   meta {
     name: Accounts
     type: http
     seq: 7
   }

   get {
     url: {{baseUrl}}/api/v1/accounts
     body: none
     auth: none
   }

   assert {
     res.status: eq 200
     res.body.data: isArray
   }

   docs {
     `accounts.index`: what it returns and why the assertions matter.
   }
   ```

2. Writes add `headers { X-XSRF-TOKEN: {{xsrfToken}} }` and a `body:json`
   block. They run only in `local` (rule 3); make them idempotent or clean
   up after themselves (create, then delete).
3. Assert the contract, not incidental data: status, `{ data }` shape,
   invariants. Use `tests { }` with `expect` for anything an `assert` line
   cannot express.
4. Run `npm run smoke:local`, then commit the `.bru` file with the change
   that needed it.
