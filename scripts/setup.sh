#!/usr/bin/env bash
# One-time setup on the owner's machine: identity, tools, labels, the private repo (asks first).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d .git ] || git init -q -b main
git config user.name kapildev333
git config user.email 47056817+kapildev333@users.noreply.github.com
chmod +x scripts/*.sh .claude/hooks/*.sh
command -v gitleaks >/dev/null || brew install gitleaks
command -v gh >/dev/null || brew install gh
repo="${AGENTBOARD_REPO:-kapildev333/agentboard}"
if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "$repo" >/dev/null 2>&1; then
    git remote add origin "https://github.com/$repo.git"
  else
    read -rp "Create PRIVATE GitHub repo $repo and push main? [y/N] " a
    if [ "${a:-n}" = y ]; then
      git add -A && git commit -q -m "chore: orchestration scaffold" || true
      gh repo create "$repo" --private --source . --remote origin --push
    else
      echo "skipped repo creation; run again when ready"
    fi
  fi
fi
if git remote get-url origin >/dev/null 2>&1; then
  for l in lane queued running review changes merged blocked needs-owner decision; do
    gh label create "$l" --force >/dev/null 2>&1 || true
  done
fi
echo "setup done: identity set, tools present, labels ensured"
