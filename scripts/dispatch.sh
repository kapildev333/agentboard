#!/usr/bin/env bash
# Launch one lane as a background Claude Code session in its own worktree.
set -euo pipefail
cd "$(dirname "$0")/.."
lane="$1"; brief=".claude/briefs/$lane.md"
[ -f "$brief" ] || { echo "dispatch: no brief at $brief" >&2; exit 1; }
model="$(sed -n 's/^model: *//p' "$brief" | head -1)"; model="${model:-claude-sonnet-5-5}"
mode="${AGENTBOARD_PERMISSION_MODE:-auto}"
settings="$(scripts/worker-settings.sh "$lane")"
claude --bg --name "$lane" -w "$lane" --model "$model" --permission-mode "$mode" --settings "$settings" "$(cat "$brief")"
