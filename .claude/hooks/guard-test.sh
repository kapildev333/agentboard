#!/usr/bin/env bash
# Self-check for guard.sh: prints PASS when every case gives the expected exit code.
# Run: bash .claude/hooks/guard-test.sh
cd "$(dirname "$0")/../.."
export CLAUDE_PROJECT_DIR="$PWD"
fail=0
check() { # expected mode role scope json
  local exp="$1" mode="$2" role="$3" scope="$4" json="$5"
  printf '%s' "$json" | AGENTBOARD_ROLE="$role" AGENTBOARD_SCOPE="$scope" .claude/hooks/guard.sh "$mode" >/dev/null 2>&1
  local got=$?
  if [ "$got" != "$exp" ]; then echo "FAIL (got $got, want $exp): $mode $role: $json"; fail=1; fi
}
j() { node -e 'process.stdout.write(JSON.stringify({tool_input:{command:process.argv[1]}}))' "$1"; }
e() { node -e 'process.stdout.write(JSON.stringify({tool_input:{file_path:process.argv[1]}}))' "$1"; }
check 0 bash worker "" "$(j 'npm test -- --run')"
check 2 bash worker "" "$(j 'curl https://x.y')"
check 2 bash worker "" "$(j 'echo hi; wget http://x')"
check 0 bash worker "" "$(j "$(printf "cat > docs/x.md <<'EOF'\nnever run curl or wget\nBash(curl *)\nEOF\nwc -l docs/x.md")")"
check 2 bash worker "" "$(j "$(printf "bash <<'EOF'\ncurl https://evil\nEOF")")"
check 2 bash worker "" "$(j "$(printf "python3 - <<'PY'\nimport os; os.system('ssh host')\nPY")")"
check 0 bash worker "" "$(j 'git push -u origin HEAD')"
check 0 bash worker "" "$(j 'git push -u origin lane/L11-pty')"
check 2 bash governor "" "$(j 'git push origin main')"
check 2 bash governor "" "$(j 'git push --force origin lane/x')"
check 2 bash worker "" "$(j 'git push origin lane/x -f')"
check 0 bash worker "" "$(j 'git push --force-with-lease origin HEAD')"
check 2 bash worker "" "$(j 'gh pr merge 3 --squash')"
check 0 bash governor "" "$(j 'gh pr merge 3 --squash --delete-branch')"
check 2 bash worker "" "$(j 'claude --bg "x"')"
check 0 bash governor "" "$(j 'claude agents --json --all')"
check 2 bash worker "" "$(j '"$(command -v claude)" --version')"
check 2 bash worker "" "$(j '/usr/local/bin/claude -p hi')"
check 0 bash worker "" "$(j 'cat .claude/briefs/L04.md')"
check 0 bash worker "" "$(j 'env NODE_OPTIONS=x npx vitest')"
check 2 bash worker "" "$(j 'env')"
check 2 bash governor "" "$(j 'printenv | grep KEY')"
check 2 bash governor "" "$(j 'gh auth token')"
check 2 bash governor "" "$(j 'cat ~/.claude.json')"
check 2 bash governor "" "$(j 'pkill -f node')"
check 2 bash governor "" "$(j 'rm -rf ~/')"
check 0 bash governor "" "$(j 'rm -rf node_modules')"
check 0 edit worker "packages/daemon/src/pty:packages/daemon/test/pty" "$(e "$PWD/packages/daemon/src/pty/manager.ts")"
check 2 edit worker "packages/daemon/src/pty:packages/daemon/test/pty" "$(e "$PWD/packages/daemon/src/server/index.ts")"
check 2 edit worker "" "$(e "$PWD/.claude/settings.json")"
check 2 edit worker "" "$(e "$PWD/.env")"
check 0 edit governor "" "$(e "$PWD/.claude/settings.json")"
check 2 edit governor "" "$(e "/etc/hosts")"
[ "$fail" = 0 ] && echo "guard-test: PASS (33 cases)" || { echo "guard-test: FAIL"; exit 1; }
