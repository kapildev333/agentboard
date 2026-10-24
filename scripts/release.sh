#!/usr/bin/env bash
# Cut a release: bump every package version, prepend the notes to CHANGELOG.md, land it on main through a
# gated PR, then publish a GitHub release on that commit with the same notes plus the merged PR list.
# Usage: scripts/release.sh <version> <notes.md>      (version like 0.1.0, no v; notes = the narrative part)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
v="$1"; notes="$2"; tag="v$v"
[[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "release: version must be X.Y.Z"; exit 1; }
[ -f "$notes" ] || { echo "release: notes file missing"; exit 1; }
git fetch -q origin && git rev-parse -q --verify "refs/tags/$tag" >/dev/null && { echo "release: $tag exists"; exit 1; }
prev="$(git describe --tags --abbrev=0 origin/main 2>/dev/null || true)"
# merged lane and chore PRs since the previous tag, newest last
since="$([ -n "$prev" ] && git log -1 --format=%cI "$prev" || echo 2000-01-01)"
prs="$(gh pr list --state merged --limit 200 --search "merged:>=$since" --json number,title -q '.[] | "- #\(.number) \(.title)"' | sort -t'#' -k2 -n)"
full="$(mktemp)"; { cat "$notes"; echo; echo "### Merged pull requests"; echo; echo "$prs"; } > "$full"
wt="$(mktemp -d "${TMPDIR:-/tmp}/agentboard-release-XXXXXX")"; wt="$(cd "$wt" && pwd -P)"   # a normalised path, or worktree remove fails
git worktree add -q "$wt" -b "release-$tag" origin/main
(
  cd "$wt"
  node -e '
const fs=require("fs");const v=process.argv[1];
const files=["package.json",...fs.readdirSync("packages").map(p=>`packages/${p}/package.json`),"packages/plugins/opencode/package.json"].filter(f=>fs.existsSync(f));
for(const f of files){const j=JSON.parse(fs.readFileSync(f,"utf8"));j.version=v;for(const k of ["dependencies","devDependencies","peerDependencies"]){for(const d of Object.keys(j[k]||{})){if(d.startsWith("@agentboard/"))j[k][d]=v;}}fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n");}
console.log("bumped "+files.length+" manifests");' "$v"
  npm install --ignore-scripts >/dev/null 2>&1
  # keep the "# Changelog" header on top; the "## Unreleased" heading becomes this version, its lines stay under it
  section="$(printf '## %s (%s)\n\n' "$tag" "$(date -u +%Y-%m-%d)"; cat "$full")"
  if [ -f CHANGELOG.md ] && grep -q '^# ' CHANGELOG.md; then
    CL_SECTION="$section" node -e '
const fs=require("fs");const s=fs.readFileSync("CHANGELOG.md","utf8").split("\n");const sec=process.env.CL_SECTION;
const h=s.findIndex(l=>/^# /.test(l));const rest=s.slice(h+1).filter(l=>!/^## Unreleased/i.test(l)).join("\n").replace(/^\n+/,"");
fs.writeFileSync("CHANGELOG.md",s.slice(0,h+1).join("\n")+"\n\n"+sec+"\n\n"+rest+"\n");'
  else
    { echo "# Changelog"; echo; echo "$section"; echo; [ -f CHANGELOG.md ] && cat CHANGELOG.md; } > CHANGELOG.new && mv CHANGELOG.new CHANGELOG.md
  fi
  mkdir -p docs/releases && cp "$OLDPWD/$notes" "docs/releases/$tag.md" 2>/dev/null || cp "$notes" "docs/releases/$tag.md"
  git add -A && git commit -q -m "chore: release $tag"
  git push -q -u origin HEAD
)
pr="$(gh pr create --head "release-$tag" --title "chore: release $tag" --body "Version bump and CHANGELOG for $tag. Gate below." | tail -1)"; pr="${pr##*/}"
scripts/merge.sh "$pr" > /tmp/release-gate.log 2>&1 || { tail -5 /tmp/release-gate.log; echo "release: gate failed, PR #$pr left open"; exit 1; }
head="$(gh pr view "$pr" --json headRefOid -q .headRefOid)"
gh pr merge "$pr" --rebase --delete-branch --match-head-commit "$head" >/dev/null
git worktree remove --force "$wt" 2>/dev/null || git worktree prune; git branch -D "release-$tag" >/dev/null 2>&1 || true
git fetch -q origin
sha="$(git rev-parse origin/main)"
gh release create "$tag" --target "$sha" --title "AgentBoard $tag" --notes-file "$full" >/dev/null
echo "== release: $tag at ${sha:0:8} published; CHANGELOG updated; PR #$pr merged"
