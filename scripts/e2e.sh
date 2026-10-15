#!/usr/bin/env bash
# End-to-end run against the real stack, from a clean slate every time:
#   1. ephemeral Postgres + MinIO (docker-compose.test.yml, torn down with -v)
#   2. the Angular build copied into the API build (same layout as the image),
#      plus the fake LLM fixtures (never in the image) so insights and receipts
#      answer from tests/fixtures/llm
#   3. migrations + `seed:e2e` (household "E2E", two users) on the E2E database
#   4. Playwright (its webServer starts the API on :3334)
# Prefer `npm run e2e` from the repo root: turbo builds api/web/shared first.
# Extra arguments go to Playwright, e.g. `npm run e2e -- --project=mobile-chromium`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_BUILD="apps/api/build"
WEB_DIST="apps/web/dist/web/browser"
# Absolute path: the cleanup trap must work from any working directory.
COMPOSE=(docker compose -f "$ROOT/docker-compose.test.yml")

if [[ ! -f "$API_BUILD/bin/server.js" || ! -f "$WEB_DIST/index.html" ]]; then
  echo "e2e: builds not found. Run 'npm run e2e' from the repo root (it builds first)." >&2
  exit 1
fi

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

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

echo "e2e: migrating ${DB_DATABASE}"
(cd "$API_BUILD" && node ace migration:run --force)

echo "e2e: seeding the E2E household"
(cd "$API_BUILD" && node ace seed:e2e)

echo "e2e: running Playwright"
(cd e2e && npx playwright test "$@")
