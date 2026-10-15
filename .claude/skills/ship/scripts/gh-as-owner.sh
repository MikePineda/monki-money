#!/usr/bin/env bash
# Runs one gh command as the repository owner's GitHub account and always
# switches back to the account that was active before, even when the command
# fails. The repo is private under the owner's account; the machine's default
# gh account (the work one) cannot see it.
#
#   .claude/skills/ship/scripts/gh-as-owner.sh pr create --base main ...
#   .claude/skills/ship/scripts/gh-as-owner.sh pr checks 12 --watch --fail-fast
#
# Equivalent by hand:
#   gh auth switch --hostname github.com --user MikePineda
#   gh <command>
#   gh auth switch --hostname github.com --user <work-account>
set -euo pipefail

owner="${GH_OWNER_ACCOUNT:-MikePineda}"
previous="$(gh api user --jq .login)"

if [[ "$previous" != "$owner" ]]; then
  gh auth switch --hostname github.com --user "$owner" >/dev/null
  trap 'gh auth switch --hostname github.com --user "$previous" >/dev/null' EXIT
fi

gh "$@"
