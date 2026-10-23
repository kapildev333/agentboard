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
# --onto replays everything after <base>; if <base> is no longer an ancestor (the worker rebased on its
# own), that would replay main's own history as copies. Then a plain rebase is the right move.
if git merge-base --is-ancestor "$base" HEAD 2>/dev/null; then
  git rebase --onto "$onto" "$base" >/tmp/rebase-$lane.log 2>&1
else
  git rebase "$onto" >/tmp/rebase-$lane.log 2>&1
fi
for _ in $(seq 1 40); do
  [ -d "$(git rev-parse --git-path rebase-merge)" ] || break
  for f in $(git diff --name-only --diff-filter=U); do
    case "$f" in
      packages/shared/src/*.js|packages/shared/src/*.d.ts) git rm -qf -- "$f" 2>/dev/null || git checkout --ours -- "$f" 2>/dev/null; git rm -qf --cached -- "$f" 2>/dev/null;;
      */tsconfig.build.json) git checkout --ours -- "$f" && git add -- "$f";;
      packages/daemon/package.json|packages/cli/package.json|packages/mcp/package.json)
        # union of main's manifest (ours) and the lane's (theirs): neither side's dependency is dropped
        git show ":2:$f" > /tmp/ours.json; git show ":3:$f" > /tmp/theirs.json
        node -e 'const fs=require("fs");const a=JSON.parse(fs.readFileSync("/tmp/ours.json","utf8")),b=JSON.parse(fs.readFileSync("/tmp/theirs.json","utf8"));const out={...a,...b};for(const k of ["dependencies","devDependencies","scripts","bin"]){if(a[k]||b[k])out[k]={...(a[k]||{}),...(b[k]||{})};}fs.writeFileSync(process.argv[1],JSON.stringify(out,null,2)+"\n")' "$f" && git add -- "$f";;
      packages/ui/package.json|packages/e2e/package.json|packages/plugins/package.json) git checkout --theirs -- "$f" && node -e 'const fs=require("fs");const p=process.argv[1];const d=JSON.parse(fs.readFileSync(p,"utf8"));if(d.scripts&&/^echo /.test(d.scripts.build||""))delete d.scripts.build;fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n")' "$f" && git add -- "$f";;
      package-lock.json) git checkout --theirs -- "$f"; npm install --ignore-scripts >/dev/null 2>&1; git add -- "$f";;
      *) git checkout --theirs -- "$f" && git add -- "$f";;
    esac
  done
  if git diff --cached --quiet && git diff --quiet; then GIT_EDITOR=true git rebase --skip >>/tmp/rebase-$lane.log 2>&1
  else GIT_EDITOR=true git rebase --continue >>/tmp/rebase-$lane.log 2>&1; fi
done
if [ -d "$(git rev-parse --git-path rebase-merge)" ]; then git rebase --abort; echo "CONFLICT unresolved, see /tmp/rebase-$lane.log"; exit 2; fi
# A replayed lockfile commit can drop entries main added since; regenerate and commit the difference.
npm install --ignore-scripts >/dev/null 2>&1
if ! git diff --quiet -- package-lock.json; then git add package-lock.json && git commit -q -m "chore: lockfile regenerated after rebase"; fi
# Copies of main's own chore commits can ride along on a lane branch (a stale rebase base made them);
# they carry a foreign author and never touch lane files, so they are dropped from the branch.
drop="$(git log "$onto"..HEAD --format='%h %ae' | grep -v '47056817+kapildev333@users.noreply.github.com' | cut -d' ' -f1 | tr '\n' ' ')"
if [ -n "$drop" ]; then
  DROP="$drop" GIT_SEQUENCE_EDITOR="$(cd "$(dirname "$0")/.." 2>/dev/null; pwd)/scripts/drop-picks.sh" GIT_EDITOR=true git rebase -i "$onto" >>/tmp/rebase-$lane.log 2>&1 \
    || { git rebase --abort; echo "CONFLICT while dropping foreign commits ($drop), see /tmp/rebase-$lane.log"; exit 2; }
  echo "dropped foreign-author commits: $drop"
fi
bad="$(git log "$onto"..HEAD --format='%h %ae' | grep -v '47056817+kapildev333@users.noreply.github.com' || true)"
if [ -n "$bad" ]; then echo "REFUSED: commits with a foreign author on the branch: $bad"; exit 4; fi
npm ci --prefer-offline >/dev/null 2>&1 && npm run -s fix-pty --if-present >/dev/null 2>&1
if scripts/gate.sh >/tmp/gate-$lane.log 2>&1; then
  git push -q --force-with-lease origin HEAD && echo "REBASED $(git rev-parse HEAD) gate=PASS"
else
  tail -n 12 /tmp/gate-$lane.log; git push -q --force-with-lease origin HEAD && echo "REBASED $(git rev-parse HEAD) gate=FAIL"; exit 3
fi
