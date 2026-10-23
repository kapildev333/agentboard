#!/usr/bin/env bash
# One screen of state for a governor tick: lanes with their state label, open pull requests, background sessions.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
git pull -q --ff-only origin main 2>/dev/null && echo "main: $(git log --oneline -1)"
echo "== lanes (lane · issue · state)"
gh issue list --label lane --state all --limit 100 --json number,title,labels,state \
  -q '.[] | [(.title|split(":")[0]), ("#" + (.number|tostring)), ([.labels[].name] | map(select(. != "lane")) | join(",")), .state] | join(" · ")' | sort
echo "== pull requests"
gh pr list --state open --limit 50 --json number,title,headRefName,headRefOid,labels \
  -q '.[] | [(.number|tostring), .title, .headRefName, (.headRefOid[0:8]), ([.labels[].name]|join(","))] | join(" · ")'
echo "== sessions (id · lane · state · status · waitingFor)"
claude agents --json --all 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  let a=[];try{a=JSON.parse(s)}catch(e){console.log("agents unreadable");return}
  for(const j of a){
    const m=/\.claude\/worktrees\/(L[0-9][0-9A-Z])(\/|$)/.exec(j.cwd||"");
    const lane=m?m[1]:(/^L[0-9][0-9A-Z]$/.test(j.name||"")?j.name:null);
    if(lane&&j.id) console.log([j.id,lane,j.state,j.status||"",j.waitingFor||""].join(" · "))
  }
})'
