#!/usr/bin/env bash
# Runs the Bruno collection (apps/api/bruno) against one target.
#
#   scripts/smoke.sh prod|local|e2e [extra bru run flags or paths]
#   npm run smoke:prod / npm run smoke:local / npm run smoke:e2e
#
# Two tiers (folders of the collection, see apps/api/bruno/README.md):
#   smoke/  read-only: probes, CSRF, the smoke user's login, reads, logout
#   full/   every resource: creates, edits and deletes, then cleans up
#
#   prod   smoke tier only, against SMOKE_BASE_URL, with --bail (the first
#          failure stops the run). The full tier never runs here.
#   local  both tiers against http://localhost:3333 (npm run dev), as the
#          smoke user (SMOKE_EMAIL / SMOKE_PASSWORD, household "Smoke").
#   e2e    both tiers against a running E2E stack (scripts/e2e.sh layout:
#          http://127.0.0.1:$E2E_API_PORT, default 3334) as the E2E seed's
#          owner (synthetic, see apps/api/app/services/e2e/e2e_seed.ts),
#          household "E2E". This is what CI runs.
# local and e2e run without --bail so the teardown always runs; the full
# tier's login stops the run itself when it lands in the wrong household.
# Extra arguments go to `bru run`: a path runs part of the collection
# (`scripts/smoke.sh local smoke` = the smoke tier only), `--env-var k=v`
# overrides a variable, `--reporter-html <file>` writes a report.
#
# Credentials come from SMOKE_EMAIL / SMOKE_PASSWORD in the shell or in
# apps/api/bruno/.env (gitignored). The production base URL is
# SMOKE_BASE_URL (https://<app-domain>), from the shell, apps/api/bruno/.env
# or docs/internal/ops.env (local only): the repo never names the domain.
# The CLI version is pinned so every machine runs the same one without
# adding it to the workspace's dependencies.
#
# Two traps handled here: `bru run` only works with the collection root as
# its working directory, and `npx` inside an npm workspace switches the
# working directory to the workspace package (apps/api). So npx only resolves
# the binary; the run happens from the collection root.
set -euo pipefail

BRUNO_CLI_VERSION="4.2.0"

target="${1:-}"
if [[ "$target" != "local" && "$target" != "prod" && "$target" != "e2e" ]]; then
  echo "usage: scripts/smoke.sh prod|local|e2e [bru run flags or paths]" >&2
  exit 2
fi
shift

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
collection_dir="$repo_root/apps/api/bruno"

if [[ "$target" == "prod" && -z "${SMOKE_BASE_URL:-}" ]]; then
  ops_env="$repo_root/docs/internal/ops.env"
  if [[ -f "$ops_env" ]] && grep -q '^SMOKE_BASE_URL=.' "$ops_env"; then
    SMOKE_BASE_URL="$(grep '^SMOKE_BASE_URL=' "$ops_env" | tail -n1 | cut -d= -f2-)"
    export SMOKE_BASE_URL
  elif ! grep -q '^SMOKE_BASE_URL=.' "$collection_dir/.env" 2>/dev/null; then
    echo "smoke:prod needs SMOKE_BASE_URL (https://<app-domain>): export it, or add it to" >&2
    echo "apps/api/bruno/.env or docs/internal/ops.env (both local only)." >&2
    exit 2
  fi
fi

case "$target" in
  prod)
    # Only the read-only tier, ever.
    run_args=(smoke --env prod --bail)
    ;;
  local)
    run_args=(--env local)
    ;;
  e2e)
    # The E2E seed's synthetic owner (test databases only), unless overridden.
    export SMOKE_EMAIL="${SMOKE_EMAIL:-owner@e2e.test}"
    export SMOKE_PASSWORD="${SMOKE_PASSWORD:-e2e-password-123}"
    run_args=(
      --env local
      --env-var "baseUrl=http://127.0.0.1:${E2E_API_PORT:-3334}"
      --env-var "smokeHousehold=E2E"
    )
    ;;
esac

bru_bin="$(npx --yes --package "@usebruno/cli@${BRUNO_CLI_VERSION}" -c 'command -v bru')"

cd "$collection_dir"
exec "$bru_bin" run "${run_args[@]}" "$@"
