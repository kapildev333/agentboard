#!/usr/bin/env bash
# Launch one lane as a background Claude Code session in its own worktree.
# Usage: scripts/dispatch.sh <lane> [base-ref]
#   no base-ref: claude -w <lane> makes the worktree from the root checkout's HEAD (main)
#   base-ref:    the worktree is stacked on that ref (an unmerged lane branch) and the worker
#                is told the base sha, so it can rebase --onto origin/main once the base merges
set -euo pipefail
cd "$(dirname "$0")/.."
lane="$1"; base="${2:-}"; brief=".claude/briefs/$lane.md"
[ -f "$brief" ] || { echo "dispatch: no brief at $brief" >&2; exit 1; }
model="$(sed -n 's/^model: *//p' "$brief" | head -1)"; model="${model:-claude-sonnet-5-5}"
mode="${AGENTBOARD_PERMISSION_MODE:-auto}"
settings="$(scripts/worker-settings.sh "$lane")"
if [ -z "$base" ]; then
  claude --bg --name "$lane" -w "$lane" --model "$model" --permission-mode "$mode" --settings "$settings" "$(cat "$brief")"
else
  wt=".claude/worktrees/$lane"
  sha="$(git rev-parse "$base")"
  [ -d "$wt" ] || git worktree add -q -b "worktree-$lane" "$wt" "$sha"
  prompt="$(cat "$brief")
Stacked on $base at $sha: your branch starts from that commit. Before opening your PR, if that base lane's PR has merged, run: git fetch origin && git rebase --onto origin/main $sha. If it has not merged, open the PR anyway and say 'Stacked on $base' in the body; the governor will tell you when to rebase. On a package-lock.json conflict, keep the incoming lockfile, run npm install, and commit."
  ( cd "$wt" && claude --bg --name "$lane" --model "$model" --permission-mode "$mode" --settings "$settings" "$prompt" )
fi
