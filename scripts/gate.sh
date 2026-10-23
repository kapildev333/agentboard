#!/usr/bin/env bash
# The gate that replaces CI. Run from any worktree; prints PASS as the last line on success.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
exec > >(sed "s#${HOME}#~#g") 2>&1   # the gate tail lands in pull request bodies: never print the home path
base="${GATE_BASE:-origin/main}"
echo "== gate: $(git rev-parse --short HEAD) on $(git branch --show-current 2>/dev/null || echo detached)"
command -v gitleaks >/dev/null || { echo "gate: gitleaks missing (brew install gitleaks)"; exit 1; }
if [ -f package-lock.json ]; then
  npm ci --prefer-offline >/dev/null
  npm run -s fix-pty --if-present   # node-pty's spawn-helper ships without the execute bit when install scripts are off
  npm run -s lint
  npm run -s typecheck
  npm test -s -- --run
  npm run -s build
  npm audit --audit-level=high
else
  echo "== gate: no package-lock.json yet; skipping npm steps (allowed only before L00 lands)"
fi
if git rev-parse --verify -q "$base" >/dev/null; then
  gitleaks detect --no-banner --redact --source . --log-opts="$base..HEAD"
else
  gitleaks detect --no-banner --redact --source .
fi
echo "== gate: PASS"
