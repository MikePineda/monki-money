#!/usr/bin/env bash
# Runs the Bruno smoke collection (apps/api/bruno) against one environment.
#
#   scripts/smoke.sh local|prod [extra bru run flags]
#   npm run smoke:local / npm run smoke:prod
#
# Credentials come from SMOKE_EMAIL / SMOKE_PASSWORD in the shell or in
# apps/api/bruno/.env (gitignored). The CLI version is pinned so every machine
# runs the same one without adding it to the workspace's dependencies.
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

collection_dir="$(cd "$(dirname "$0")/../apps/api/bruno" && pwd)"
bru_bin="$(npx --yes --package "@usebruno/cli@${BRUNO_CLI_VERSION}" -c 'command -v bru')"

cd "$collection_dir"
exec "$bru_bin" run --env "$env_name" --bail "$@"
