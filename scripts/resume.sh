#!/usr/bin/env bash
# Resume a lane's worker conversation as a new background session, inside the lane's worktree,
# with the same model, permission mode and worker settings as dispatch.sh.
# Usage: scripts/resume.sh <lane> <sessionId> "<message>"
set -euo pipefail
cd "$(dirname "$0")/.."
lane="$1"; session="$2"; message="$3"
brief=".claude/briefs/$lane.md"
model="$(sed -n 's/^model: *//p' "$brief" | head -1)"; model="${model:-claude-sonnet-5-5}"
mode="${AGENTBOARD_PERMISSION_MODE:-auto}"
settings="$(scripts/worker-settings.sh "$lane")"
wt=".claude/worktrees/$lane"
[ -d "$wt" ] || { echo "resume: no worktree at $wt" >&2; exit 1; }
cd "$wt"
claude --resume "$session" --bg --name "$lane" --model "$model" --permission-mode "$mode" --settings "$settings" "$message"
