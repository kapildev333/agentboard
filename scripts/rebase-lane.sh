#!/usr/bin/env bash
# Rebase a stacked lane onto main after its base lane merged, gate it, and push with --force-with-lease.
# Usage: scripts/rebase-lane.sh <lane> <old-base-sha> [onto-ref]   (onto-ref defaults to origin/main)
# Run only while the lane's worker session is idle. Prints REBASED <head> on success; on a conflict it
# aborts the rebase, prints CONFLICT and the files, and leaves the worktree as it was.
set -uo pipefail
cd "$(dirname "$0")/.."
lane="$1"; base="$2"; onto="${3:-origin/main}"; wt=".claude/worktrees/$lane"
[ -d "$wt" ] || { echo "rebase-lane: no worktree at $wt" >&2; exit 1; }
cd "$wt"
git fetch -q origin || exit 1
if ! git rebase --onto "$onto" "$base" >/tmp/rebase-$lane.log 2>&1; then
  files="$(git diff --name-only --diff-filter=U | tr '\n' ' ')"
  if [ "$files" = "package-lock.json " ]; then
    git checkout --theirs package-lock.json && npm install --ignore-scripts >/dev/null 2>&1 && git add package-lock.json && GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || { git rebase --abort; echo "CONFLICT package-lock.json (auto-resolve failed)"; exit 2; }
  else
    git rebase --abort; echo "CONFLICT $files"; exit 2
  fi
fi
npm ci --prefer-offline >/dev/null 2>&1 && npm run -s fix-pty --if-present >/dev/null 2>&1
if scripts/gate.sh >/tmp/gate-$lane.log 2>&1; then
  git push -q --force-with-lease origin HEAD && echo "REBASED $(git rev-parse HEAD) gate=PASS"
else
  tail -n 15 /tmp/gate-$lane.log; git push -q --force-with-lease origin HEAD && echo "REBASED $(git rev-parse HEAD) gate=FAIL"
  exit 3
fi
