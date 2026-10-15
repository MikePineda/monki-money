#!/usr/bin/env bash
# Runs one gh command as the repository owner's GitHub account and always
# switches back afterwards, even when the command fails. Useful when the
# machine's default gh account is another one (for example a work account).
#
#   .claude/skills/ship/scripts/gh-as-owner.sh pr create --base main ...
#   .claude/skills/ship/scripts/gh-as-owner.sh pr checks 12 --watch --fail-fast
#
# Accounts: MONKIMONEY_GH_OWNER (the repo owner, default MikePineda) and,
# optionally, MONKIMONEY_GH_WORK_ACCOUNT (the account to switch back to;
# default: the account that was active before). Both come from
# docs/internal/ops.env when that file exists (local only, never committed;
# a git worktree falls back to the main checkout's copy), else from the
# environment.
#
# Equivalent by hand:
#   gh auth switch --hostname github.com --user "$MONKIMONEY_GH_OWNER"
#   gh <command>
#   gh auth switch --hostname github.com --user "$MONKIMONEY_GH_WORK_ACCOUNT"
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../../.." && pwd)"
common_git_dir="$(git -C "$repo_root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
for ops_env in "$repo_root/docs/internal/ops.env" "${common_git_dir%/.git}/docs/internal/ops.env"; do
  if [[ -f "$ops_env" ]]; then
    set -a
    # shellcheck source=/dev/null
    . "$ops_env"
    set +a
    break
  fi
done

owner="${MONKIMONEY_GH_OWNER:-MikePineda}"
previous="$(gh api user --jq .login)"
back_to="${MONKIMONEY_GH_WORK_ACCOUNT:-$previous}"

if [[ "$previous" != "$owner" ]]; then
  gh auth switch --hostname github.com --user "$owner" >/dev/null
  trap 'gh auth switch --hostname github.com --user "$back_to" >/dev/null' EXIT
fi

gh "$@"
