#!/usr/bin/env bash
# End-to-end run against the real stack, from a clean slate every time:
#   1. ephemeral Postgres + MinIO (docker-compose.test.yml, torn down with -v)
#   2. the Angular build copied into the API build (same layout as the image),
#      plus the fake LLM fixtures (never in the image) so insights and receipts
#      answer from tests/fixtures/llm
#   3. migrations + `seed:e2e` (household "E2E", two users) on the E2E database
#   4. Playwright (its webServer starts the API on the slot's port)
# Prefer `npm run e2e` from the repo root: turbo builds api/web/shared first.
# Extra arguments go to Playwright, after turbo's own `--`:
# `npm run e2e -- -- --project=mobile-chromium` (or `npx turbo run e2e -- ...`).
#
# Slots: every run owns one copy of the stack, picked by E2E_SLOT (an integer,
# default 0). This script is the only place that turns a slot into names and
# ports; it exports them and compose, Playwright and the API read the env.
#
#   slot  compose project       API    Postgres  MinIO (+ console)  Playwright folders
#   0     monkimoney-test       3334   5433      9100 (9101)        test-results, playwright-report
#   N     monkimoney-test-N     3334+N 5433+N    9100+2N (+1)       test-results-N, playwright-report-N
#
# Without E2E_SLOT the first free slot is used (0 when nothing else runs), so
# two checkouts can run the suite at the same time. A set E2E_SLOT that is
# already taken stops the run instead. Teardown only removes this run's project.
# While another slot runs, Playwright gets 3 workers (E2E_WORKERS overrides).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_BUILD="apps/api/build"
WEB_DIST="apps/web/dist/web/browser"
# One directory per claimed slot, holding the owner's PID (see claim_slot). They
# live in the clone's shared git directory, so every worktree of this checkout
# sees the same locks (outside a git checkout: the temp directory).
LOCKS="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo "${TMPDIR:-/tmp}")/e2e-slots"
mkdir -p "$LOCKS"
MAX_SLOT=19

if [[ ! -f "$API_BUILD/bin/server.js" || ! -f "$WEB_DIST/index.html" ]]; then
  echo "e2e: builds not found. Run 'npm run e2e' from the repo root (it builds first)." >&2
  exit 1
fi

# Names and ports of a slot, as the variables compose, Playwright and the API read.
slot_env() {
  local slot=$1
  E2E_SLOT=$slot
  E2E_PROJECT="monkimoney-test"
  E2E_RESULTS_DIR="test-results"
  E2E_REPORT_DIR="playwright-report"
  if ((slot > 0)); then
    E2E_PROJECT+="-$slot"
    E2E_RESULTS_DIR+="-$slot"
    E2E_REPORT_DIR+="-$slot"
  fi
  E2E_API_PORT=$((3334 + slot))
  E2E_DB_PORT=$((5433 + slot))
  E2E_S3_PORT=$((9100 + 2 * slot))
  E2E_S3_CONSOLE_PORT=$((E2E_S3_PORT + 1))
}

# True when something already listens on one of the slot's ports or the slot's
# compose project still has containers (a run that was not torn down).
slot_busy() {
  slot_env "$1"
  local port
  for port in "$E2E_API_PORT" "$E2E_DB_PORT" "$E2E_S3_PORT" "$E2E_S3_CONSOLE_PORT"; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
  done
  [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$E2E_PROJECT")" ]]
}

# Claims a slot for this run (mkdir is atomic, so two runs starting together
# never get the same one). A lock whose owner is gone is taken over.
LOCK=""
claim_slot() {
  local lock="$LOCKS/slot-$1" owner
  if mkdir "$lock" 2>/dev/null; then
    echo $$ >"$lock/pid"
    LOCK=$lock
    return 0
  fi
  owner="$(cat "$lock/pid" 2>/dev/null || true)"
  if [[ -n "$owner" ]] && ! kill -0 "$owner" 2>/dev/null; then
    rm -rf "$lock"
    claim_slot "$1"
    return
  fi
  return 1
}

release_slot() {
  if [[ -n "$LOCK" ]]; then
    rm -rf "$LOCK"
    LOCK=""
  fi
}

# True when another live run holds a slot (a lock other than ours whose PID runs).
other_runs() {
  local lock owner
  for lock in "$LOCKS"/slot-*; do
    [[ -d "$lock" && "$lock" != "$LOCK" ]] || continue
    owner="$(cat "$lock/pid" 2>/dev/null || true)"
    if [[ -n "$owner" ]] && kill -0 "$owner" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}

if [[ -n "${E2E_SLOT:-}" ]]; then
  if [[ ! "$E2E_SLOT" =~ ^[0-9]+$ ]] || ((E2E_SLOT > MAX_SLOT)); then
    echo "e2e: E2E_SLOT must be an integer from 0 to $MAX_SLOT (got '$E2E_SLOT')." >&2
    exit 1
  fi
  slot=$E2E_SLOT
  if ! claim_slot "$slot"; then
    echo "e2e: slot $slot is in use by another run (PID $(cat "$LOCKS/slot-$slot/pid" 2>/dev/null))." >&2
    exit 1
  fi
  if slot_busy "$slot"; then
    release_slot
    echo "e2e: slot $slot is busy (one of ports $E2E_API_PORT/$E2E_DB_PORT/$E2E_S3_PORT/$E2E_S3_CONSOLE_PORT is taken or project $E2E_PROJECT has containers). Unset E2E_SLOT to pick a free one." >&2
    exit 1
  fi
else
  slot=""
  for candidate in $(seq 0 "$MAX_SLOT"); do
    if claim_slot "$candidate"; then
      if ! slot_busy "$candidate"; then
        slot=$candidate
        break
      fi
      release_slot
    fi
  done
  if [[ -z "$slot" ]]; then
    echo "e2e: no free slot from 0 to $MAX_SLOT." >&2
    exit 1
  fi
fi

slot_env "$slot"
export E2E_SLOT E2E_PROJECT E2E_RESULTS_DIR E2E_REPORT_DIR E2E_API_PORT E2E_DB_PORT E2E_S3_PORT E2E_S3_CONSOLE_PORT
echo "e2e: slot $E2E_SLOT (project $E2E_PROJECT, API :$E2E_API_PORT, Postgres :$E2E_DB_PORT, MinIO :$E2E_S3_PORT)"

# Absolute path: the cleanup trap must work from any working directory.
COMPOSE=(docker compose -p "$E2E_PROJECT" -f "$ROOT/docker-compose.test.yml")

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  release_slot
}
trap cleanup EXIT
# Ctrl-C and kill go through the EXIT trap too, so the stack never outlives the run.
trap 'exit 130' INT
trap 'exit 143' TERM

echo "e2e: starting docker-compose.test.yml"
"${COMPOSE[@]}" up -d --wait db minio
"${COMPOSE[@]}" run --rm minio-init >/dev/null

echo "e2e: copying the web build into the API build"
rm -rf "$API_BUILD/public"
mkdir -p "$API_BUILD/public"
cp -R "$WEB_DIST/." "$API_BUILD/public/"

# LLM_PROVIDER=fake reads its answers from <app root>/tests/fixtures/llm; the
# API build does not carry them (production must not), so the E2E run adds them.
echo "e2e: copying the fake LLM fixtures into the API build"
rm -rf "$API_BUILD/tests/fixtures/llm"
mkdir -p "$API_BUILD/tests/fixtures"
cp -R apps/api/tests/fixtures/llm "$API_BUILD/tests/fixtures/llm"

set -a
# shellcheck source=../e2e/e2e.env
source e2e/e2e.env
set +a
# The API's port-dependent settings for this slot (e2e.env holds the rest).
export PORT="$E2E_API_PORT"
export APP_URL="http://127.0.0.1:$E2E_API_PORT"
export DB_PORT="$E2E_DB_PORT"
export S3_ENDPOINT="http://127.0.0.1:$E2E_S3_PORT"

echo "e2e: migrating ${DB_DATABASE}"
(cd "$API_BUILD" && node ace migration:run --force)

echo "e2e: seeding the E2E household"
(cd "$API_BUILD" && node ace seed:e2e)

# Workers: two suites at Playwright's default worker count overload one machine
# (navigations then miss their 5 s), so a run that finds another slot claimed
# when its tests start uses 3. A set E2E_WORKERS wins, and a --workers flag
# passed to Playwright wins over both. Alone (CI included) nothing changes.
if [[ -z "${E2E_WORKERS:-}" ]] && other_runs; then
  E2E_WORKERS=3
fi
export E2E_WORKERS="${E2E_WORKERS:-}"

echo "e2e: running Playwright on slot $E2E_SLOT, workers: ${E2E_WORKERS:-default}"
(cd e2e && npx playwright test "$@")
