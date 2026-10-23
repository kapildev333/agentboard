#!/usr/bin/env bash
# Resume a lane's worker conversation as a new background session, inside the lane's worktree,
# with the same model, permission mode and worker settings as dispatch.sh.
# Usage: scripts/resume.sh <lane> <jobId-or-sessionId> "<message>"
# A short job id (as `claude agents` prints it) is looked up to the conversation's full session id,
# because `claude --resume` needs the latter and otherwise opens the interactive picker and blocks.
set -euo pipefail
cd "$(dirname "$0")/.."
lane="$1"; given="$2"; message="$3"
brief=".claude/briefs/$lane.md"
model="$(sed -n 's/^model: *//p' "$brief" | head -1)"; model="${model:-claude-sonnet-5-5}"
mode="${AGENTBOARD_PERMISSION_MODE:-auto}"
settings="$(scripts/worker-settings.sh "$lane")"
session="$given"
if ! [[ "$given" =~ ^[0-9a-f]{8}-[0-9a-f]{4}- ]]; then
  session="$(claude agents --json --all 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s).find(x=>x.id===process.argv[1]);process.stdout.write(j&&j.sessionId?j.sessionId:"")})' "$given")"
  [ -n "$session" ] || { echo "resume: no session id found for job $given" >&2; exit 1; }
fi
wt=".claude/worktrees/$lane"
[ -d "$wt" ] || { echo "resume: no worktree at $wt" >&2; exit 1; }
cd "$wt"
claude --resume "$session" --bg --name "$lane" --model "$model" --permission-mode "$mode" --settings "$settings" "$message"
