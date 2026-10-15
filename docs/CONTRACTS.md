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
- Unknown routes: JSON 404 (`{ message }`), including any `/api/*` GET that
  would otherwise hit the SPA fallback.
- Amounts are integer cents named `*Cents`; dates are `YYYY-MM-DD`.
- Another household's resource: 404, never 403.

## Endpoints today

| Name           | Method and path        | Response                                                                                    |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `health.ready` | `GET /api/health`      | `HealthReport` (`@monkimoney/shared`), 200 or 503                                           |
| `health.live`  | `GET /api/health/live` | `{ status: 'ok' }`                                                                          |
| `config.show`  | `GET /api/v1/config`   | `{ data: PublicConfig }`: `registrationOpen`, `version`, `turnstileSiteKey`, `sentryDsnWeb` |
