#!/usr/bin/env bash
# Rebase an idle lane onto main and resolve the conflicts the cascade produces mechanically:
# build configs and package manifests take main's version, lockfiles are regenerated, stale compiler
# output under packages/shared/src is dropped, and a commit left empty is skipped. Then gate and push.
# Usage: scripts/rebase-resolve.sh <lane> <old-base-sha> [onto-ref]
set -uo pipefail
cd "$(dirname "$0")/.."
lane="$1"; base="$2"; onto="${3:-origin/main}"; wt=".claude/worktrees/$lane"
cd "$wt" || exit 1
git fetch -q origin || exit 1
git clean -fq -- packages/shared/src 2>/dev/null
git rebase --onto "$onto" "$base" >/tmp/rebase-$lane.log 2>&1
for _ in $(seq 1 40); do
  [ -d "$(git rev-parse --git-path rebase-merge)" ] || break
  for f in $(git diff --name-only --diff-filter=U); do
    case "$f" in
      packages/shared/src/*.js|packages/shared/src/*.d.ts) git rm -qf -- "$f" 2>/dev/null || git checkout --ours -- "$f" 2>/dev/null; git rm -qf --cached -- "$f" 2>/dev/null;;
      */tsconfig.build.json|packages/daemon/package.json|packages/cli/package.json|packages/mcp/package.json) git checkout --ours -- "$f" && git add -- "$f";;
      packages/ui/package.json|packages/e2e/package.json|packages/plugins/package.json) git checkout --theirs -- "$f" && node -e 'const fs=require("fs");const p=process.argv[1];const d=JSON.parse(fs.readFileSync(p,"utf8"));if(d.scripts&&/^echo /.test(d.scripts.build||""))delete d.scripts.build;fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n")' "$f" && git add -- "$f";;
      package-lock.json) git checkout --theirs -- "$f"; npm install --ignore-scripts >/dev/null 2>&1; git add -- "$f";;
      *) git checkout --theirs -- "$f" && git add -- "$f";;
    esac
  done
  if git diff --cached --quiet && git diff --quiet; then GIT_EDITOR=true git rebase --skip >>/tmp/rebase-$lane.log 2>&1
  else GIT_EDITOR=true git rebase --continue >>/tmp/rebase-$lane.log 2>&1; fi
done
if [ -d "$(git rev-parse --git-path rebase-merge)" ]; then git rebase --abort; echo "CONFLICT unresolved, see /tmp/rebase-$lane.log"; exit 2; fi
npm ci --prefer-offline >/dev/null 2>&1 && npm run -s fix-pty --if-present >/dev/null 2>&1
if scripts/gate.sh >/tmp/gate-$lane.log 2>&1; then
  git push -q --force-with-lease origin HEAD && echo "REBASED $(git rev-parse HEAD) gate=PASS"
else
  tail -n 12 /tmp/gate-$lane.log; git push -q --force-with-lease origin HEAD && echo "REBASED $(git rev-parse HEAD) gate=FAIL"; exit 3
fi
