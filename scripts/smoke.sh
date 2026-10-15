#!/usr/bin/env bash
# Runs the Bruno smoke collection (apps/api/bruno) against one environment.
#
#   scripts/smoke.sh local|prod [extra bru run flags]
#   npm run smoke:local / npm run smoke:prod
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

env_name="${1:-}"
if [[ "$env_name" != "local" && "$env_name" != "prod" ]]; then
  echo "usage: scripts/smoke.sh local|prod [bru run flags]" >&2
  exit 2
fi
shift

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
collection_dir="$repo_root/apps/api/bruno"

if [[ "$env_name" == "prod" && -z "${SMOKE_BASE_URL:-}" ]]; then
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

bru_bin="$(npx --yes --package "@usebruno/cli@${BRUNO_CLI_VERSION}" -c 'command -v bru')"

cd "$collection_dir"
exec "$bru_bin" run --env "$env_name" --bail "$@"
