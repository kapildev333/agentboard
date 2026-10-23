#!/usr/bin/env bash
# Prints the inline --settings JSON for one worker: worker-settings.json plus the lane's scope.
set -euo pipefail
cd "$(dirname "$0")/.."
lane="$1"; brief=".claude/briefs/$lane.md"
scope="$(sed -n 's/^scope: *//p' "$brief" | head -1)"
node -e '
const fs=require("fs");
const s=JSON.parse(fs.readFileSync(".claude/worker-settings.json","utf8"));
s.env=Object.assign({},s.env,{AGENTBOARD_ROLE:"worker",AGENTBOARD_LANE:process.argv[1],AGENTBOARD_SCOPE:process.argv[2]});
process.stdout.write(JSON.stringify(s));' "$lane" "$scope"
