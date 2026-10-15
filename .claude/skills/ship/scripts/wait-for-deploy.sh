#!/usr/bin/env bash
# Polls <base-url>/api/health until it reports the expected git sha (full or
# a prefix) with status "ok", then prints the report. Read-only.
#
#   wait-for-deploy.sh <base-url> <sha> [timeout-seconds=900] [interval-seconds=15]
#
# Exit 0: the new build is live. Exit 1: timeout (the build failed, is still
# queued, or Swarm rolled back: read the Dokploy deployment log).
#
# Cloudflare's Browser Integrity Check answers 403 to non-browser clients,
# hence the browser User-Agent.
set -euo pipefail

base_url="${1:?usage: wait-for-deploy.sh <base-url> <sha> [timeout] [interval]}"
want="${2:?usage: wait-for-deploy.sh <base-url> <sha> [timeout] [interval]}"
timeout="${3:-900}"
interval="${4:-15}"

user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
started=$(date +%s)

while true; do
  body="$(curl -sS --max-time 10 -A "$user_agent" -H 'Accept: application/json' "${base_url%/}/api/health" 2>&1 || true)"
  # Prints "<sha> <status> <version>", or "unreachable" when the body is not a health report.
  summary="$(printf '%s' "$body" | node -e '
    let raw = ""
    process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
      try {
        const report = JSON.parse(raw)
        console.log(`${report.sha} ${report.status} ${report.version}`)
      } catch {
        console.log("unreachable - -")
      }
    })
  ')"
  read -r sha status version <<<"$summary"
  elapsed=$(( $(date +%s) - started ))

  if [[ "$sha" == "$want"* && "$status" == "ok" ]]; then
    echo "live after ${elapsed}s: version ${version}, sha ${sha}"
    exit 0
  fi

  if (( elapsed >= timeout )); then
    echo "timeout after ${elapsed}s waiting for ${want}; production reports: ${body}" >&2
    exit 1
  fi

  echo "${elapsed}s: production at ${sha:0:12} (${status}), waiting for ${want:0:12}"
  sleep "$interval"
done
