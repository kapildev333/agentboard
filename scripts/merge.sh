#!/usr/bin/env bash
# Rerun the gate on a pull request's head in a scratch worktree. Prints head sha and status.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
pr="$1"
head="$(gh pr view "$pr" --json headRefOid -q .headRefOid)"
git fetch -q origin "refs/pull/$pr/head"
dir="$(mktemp -d "${TMPDIR:-/tmp}/agentboard-gate-XXXXXX")"
git worktree add -q --detach "$dir" FETCH_HEAD
set +e
( cd "$dir" && GATE_BASE=origin/main scripts/gate.sh ) > "$dir.log" 2>&1
status=$?
set -e
git worktree remove --force "$dir"
tail -n 40 "$dir.log"
echo "== merge.sh: pr=$pr head=$head status=$status log=$dir.log"
exit $status
