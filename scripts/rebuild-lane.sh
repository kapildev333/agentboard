#!/usr/bin/env bash
# Rebuild a lane branch from the lane's own commits only. A new branch starts at <onto> and every commit
# in <onto>..HEAD whose files all sit inside the lane's scope (or the lockfile) is cherry-picked onto it;
# anything else (copies of main's chore commits, foreign authors) is dropped and listed. Lockfile
# conflicts are regenerated; a package manifest conflict is resolved by merging both sides' maps.
# Usage: scripts/rebuild-lane.sh <lane> [onto-ref]      (run only while the lane's worker is idle)
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; cd "$root"
lane="$1"; onto="${2:-origin/main}"; wt=".claude/worktrees/$lane"; brief=".claude/briefs/$lane.md"
scope="$(sed -n 's/^scope: *//p' "$brief" | head -1)"
[ -n "$scope" ] || { echo "rebuild: no scope in $brief" >&2; exit 1; }
cd "$wt" || exit 1
git fetch -q origin || exit 1
IFS=: read -ra scopes <<<"$scope"
inscope() { case "$1" in package-lock.json) return 0;; esac; for s in "${scopes[@]}"; do case "$1" in "$s"|"$s"/*) return 0;; esac; done; return 1; }
keep=()
for c in $(git rev-list --reverse "$onto"..HEAD); do
  ok=1
  for f in $(git show --name-only --format= "$c"); do inscope "$f" || { ok=0; break; }; done
  if [ $ok = 1 ]; then keep+=("$c"); else echo "drop: $(git log -1 --format='%h %ae %s' "$c" | cut -c1-80)"; fi
done
[ "${#keep[@]}" -gt 0 ] || { echo "rebuild: nothing to keep" >&2; exit 1; }
git checkout -q --detach "$onto" || exit 1
mergemanifest() { # $1 = conflicted package.json: union of main's (ours) and the lane's (theirs) maps
  git show ":2:$1" > /tmp/ours.json; git show ":3:$1" > /tmp/theirs.json
  node -e '
const fs=require("fs");const a=JSON.parse(fs.readFileSync("/tmp/ours.json","utf8")),b=JSON.parse(fs.readFileSync("/tmp/theirs.json","utf8"));
const out={...a,...b};for(const k of ["dependencies","devDependencies","scripts","bin"]){if(a[k]||b[k])out[k]={...(a[k]||{}),...(b[k]||{})};}
if(out.scripts&&/^echo /.test(out.scripts.build||""))delete out.scripts.build;
fs.writeFileSync(process.argv[1],JSON.stringify(out,null,2)+"\n")' "$1"
}
for c in "${keep[@]}"; do
  if git cherry-pick "$c" >/dev/null 2>&1; then continue; fi
  if git diff --cached --quiet && git diff --quiet; then git cherry-pick --skip >/dev/null 2>&1; continue; fi
  for f in $(git diff --name-only --diff-filter=U); do
    case "$f" in
      package-lock.json) git checkout --theirs -- "$f"; npm install --ignore-scripts >/dev/null 2>&1; git add -- "$f";;
      packages/*/package.json) mergemanifest "$f" && git add -- "$f";;
      *) git cherry-pick --abort; git checkout -q "worktree-$lane"; echo "CONFLICT at ${c:0:8} in $f"; exit 2;;
    esac
  done
  GIT_EDITOR=true git cherry-pick --continue >/dev/null 2>&1 || { git cherry-pick --abort; git checkout -q "worktree-$lane"; echo "CONFLICT continuing ${c:0:8}"; exit 2; }
done
git branch -f "worktree-$lane" HEAD && git checkout -q "worktree-$lane"
npm install --ignore-scripts >/dev/null 2>&1
if ! git diff --quiet -- package-lock.json; then git add package-lock.json && git commit -q -m "chore: lockfile regenerated after rebuild"; fi
bad="$(git log "$onto"..HEAD --format='%h %ae' | grep -v '47056817+kapildev333@users.noreply.github.com' || true)"
[ -z "$bad" ] || { echo "REFUSED: foreign author remains: $bad"; exit 4; }
npm ci --prefer-offline >/dev/null 2>&1 && npm run -s fix-pty --if-present >/dev/null 2>&1
if "$root/scripts/gate.sh" >/tmp/gate-$lane.log 2>&1; then
  git push -q --force-with-lease origin HEAD && echo "REBUILT $(git rev-parse HEAD) gate=PASS commits=${#keep[@]}"
else
  tail -n 12 /tmp/gate-$lane.log; git push -q --force-with-lease origin HEAD && echo "REBUILT $(git rev-parse HEAD) gate=FAIL"; exit 3
fi
