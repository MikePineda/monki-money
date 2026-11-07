#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions (.claude/settings.json): gets
# a fresh VM ready for `npm run verify`. Local sessions exit on the first check.
#
# The VM's filesystem comes from the environment's setup script snapshot, so
# only what does not survive a snapshot is done here: running processes, the
# session's environment and this checkout's dependencies.
#
# Stdout reaches Claude as session context: one status line plus what needs
# acting on. Details go to the log. It always exits 0, so a failed step leaves a
# usable session with a warning instead of a failed start.
set -uo pipefail

if [[ "${CLAUDE_CODE_REMOTE:-}" != "true" ]]; then
  exit 0
fi

LOG="${CLOUD_SETUP_LOG:-/tmp/cloud-setup.log}"
NODE_BIN="${CLOUD_SETUP_NODE_BIN:-/opt/node24/bin}"
REQUIRED_NODE_MAJOR=24
warnings=()

warn() {
  warnings+=("$1")
}

log() {
  echo "[cloud-setup] $*" >>"$LOG"
}

# Bash commands in this session read these through CLAUDE_ENV_FILE.
persist_env() {
  if [[ -n "${CLAUDE_ENV_FILE:-}" ]]; then
    echo "$1" >>"$CLAUDE_ENV_FILE"
  fi
}

setup_environment() {
  if [[ -x "$NODE_BIN/node" ]]; then
    export PATH="$NODE_BIN:$PATH"
    persist_env "export PATH=\"$NODE_BIN:\$PATH\""
  fi
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo none)"
  if [[ "$major" != "$REQUIRED_NODE_MAJOR" ]]; then
    warn "Node $REQUIRED_NODE_MAJOR is not installed (found: $major). Add the Node step to the environment's setup script; installs and tests may fail until then."
  fi

  persist_env 'export TURBO_TELEMETRY_DISABLED=1'
  persist_env 'export NG_CLI_ANALYTICS=false'
  if [[ -n "${CHROME_PATH:-}" ]]; then
    persist_env "export E2E_CHROMIUM_PATH=\"$CHROME_PATH\""
  else
    warn "CHROME_PATH is not set, so E2E will look for Playwright's browsers, which this network may not reach."
  fi
}

# Every file npm ci reads. The hash goes away before installing, so a failed
# install runs again next time.
install_dependencies() {
  local hashes=node_modules/.cloud-setup.sha256
  if sha256sum --check --status "$hashes" 2>/dev/null; then
    log "dependencies unchanged, skipping npm ci"
    return
  fi
  rm -f "$hashes"
  log "running npm ci"
  if npm ci --prefer-offline --no-audit --no-fund >>"$LOG" 2>&1; then
    sha256sum .nvmrc package.json package-lock.json apps/*/package.json packages/*/package.json e2e/package.json >"$hashes" || rm -f "$hashes"
  else
    warn "npm ci failed; run it again and read the error."
  fi
}

# `node ace` boots the app, so start/env.ts must validate even for codegen and
# tests. Same steps as a fresh clone in CI (.github/workflows/ci.yml).
prepare_api_env() {
  if [[ -f apps/api/.env ]]; then
    return
  fi
  if ! (cp apps/api/.env.example apps/api/.env && cd apps/api && node ace generate:key) >>"$LOG" 2>&1; then
    rm -f apps/api/.env
    warn "Could not create apps/api/.env; codegen and API tests need it."
  fi
}

ensure_docker() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  log "starting dockerd"
  service docker start >>"$LOG" 2>&1 || nohup dockerd >>"$LOG" 2>&1 &
  local attempt
  for attempt in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then
      return 0
    fi
    log "waiting for dockerd ($attempt)"
    sleep 1
  done
  return 1
}

# Only Postgres: the Japa suite needs nothing else, and `npm run e2e` starts its
# own stack on other ports.
start_database() {
  if ! ensure_docker; then
    warn "Docker is not running, so Postgres is down; API tests and E2E will fail."
    return
  fi
  if ! timeout 180 docker compose up -d --wait db >>"$LOG" 2>&1; then
    warn "Could not start Postgres with docker compose; API tests will fail."
  fi
}

: >"$LOG" 2>/dev/null || LOG=/dev/null
cd "${CLAUDE_PROJECT_DIR:-$(dirname "${BASH_SOURCE[0]}")/..}" || {
  echo "cloud-setup: could not enter the project directory."
  exit 0
}

setup_environment
install_dependencies
prepare_api_env
start_database

if ((${#warnings[@]} == 0)); then
  echo "cloud-setup: ready (Node $(node -v 2>/dev/null), dependencies installed, Postgres up)."
else
  echo "cloud-setup: finished with warnings (log: $LOG):"
  printf -- '- %s\n' "${warnings[@]}"
fi
exit 0
