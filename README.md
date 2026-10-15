# monkimoney

A couples' finance PWA (AUD): quick manual entry, NAB CSV import without
duplicates, and a monthly breakdown by category and person. Multi-household
from day one.

- **Stack:** AdonisJS 7 API + Postgres 17, Angular 22 PWA, npm workspaces +
  Turborepo, one Docker image deployed by Dokploy on merge to `main`.
- **Start here:** [`CLAUDE.md`](CLAUDE.md) (rules and commands),
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
  [`docs/CONTRACTS.md`](docs/CONTRACTS.md), [`docs/RUNBOOK.md`](docs/RUNBOOK.md),
  [`BRIEF.md`](BRIEF.md).

```bash
nvm use 24 && docker compose up -d
cp apps/api/.env.example apps/api/.env && (cd apps/api && node ace generate:key)
npm install && (cd apps/api && node ace migration:run)
npm run dev        # http://localhost:4200
npm run verify     # the gate before any pull request
```
