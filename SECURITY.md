# Security

## Reporting

This is a private project. Report anything security-related directly to the
repository owner, not in a public issue. Include steps to reproduce and the
affected commit (`GET /api/health` reports `version` and `sha`).

## Rules the code follows

- Secrets only in environment variables (Dokploy panel in production, a
  gitignored `.env` locally). `apps/api/start/env.ts` validates them at boot
  and wraps them in `Secret` so they do not leak through logs. Gitleaks runs
  on every push and pull request.
- No personal data in the repo: real names, emails and bank exports never
  get committed; fixtures are synthetic.
- Cookie sessions only (httpOnly, `secure` in production, `sameSite: lax`),
  CSRF protection on mutating requests, `session_version` to revoke sessions.
- Every resource is scoped by household; cross-household access answers 404.
- All input is validated (VineJS) in bodies, queries and params. Uploads have
  size and type limits and are never written to local disk.
- LLM calls receive untrusted bank/receipt text as delimited data, have no
  tools, and their output is schema-validated.
- The container runs as `node`, the code is root-owned and read-only, and
  there is no volume. Postgres has no external port.
- Dependencies: Dependabot (weekly npm, monthly actions) and
  `npm audit --omit=dev` in CI.

## Known gaps (tracked)

- CSP is off on day one; nonce-based CSP lands later (report-only first).
- 2FA on the Dokploy panel must be enabled by the owner.
