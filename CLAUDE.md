# AgentBoard

A free local tool: a Node daemon runs coding-agent CLIs as terminals on a board in the browser, and any CLI can invoke it. Spec: `docs/superpowers/specs/2026-10-23-agentboard-design.md`. Build plan: `docs/superpowers/plans/2026-10-23-multi-agent-build-plan.md`.

## Rules for every session

- TypeScript strict, Node 22, npm workspaces under `packages/` (shared, daemon, ui, cli, mcp, plugins, e2e). Exact dependency versions; `npm ci` only; a new dependency needs a one-line justification in the PR body.
- Test first with Vitest: one failing test, run it red, the smallest code, run it green, commit `test:` then `feat:`. Playwright lives only in `packages/e2e`.
- Commits: short imperative subject with `feat:`, `fix:`, `test:` or `chore:`; author is the repo's git config; no Co-Authored-By, no "Generated with", no session links.
- Never write secrets, tokens, keys, hostnames or personal data into files, commits, PR bodies, issues or logs. `.env*` stays gitignored and empty of real values.
- Never run curl, wget, ssh, scp, nc, sudo, docker, npm publish, `gh auth`, `security`, `printenv` or bare `env`; never push to main; never force-push. The guard hook refuses these.
- Workers edit only inside their worktree and the paths their brief names. A change needed elsewhere goes under "Requests" in the PR body.
- Run `scripts/gate.sh` before opening a PR and paste its last 20 lines into the PR body.
- Never ask the owner anything from inside a lane. A design choice the card leaves open: decide it, note it under "Decisions" in the PR body.
- Scratch servers run on a random free port and are stopped by PID or by that port, never by `pkill -f`.
- Never execute or install third-party agent binaries (codex, gemini, opencode, aider or others): macOS blocks unsigned ones with a malware dialog on the owner's screen. Build and unit-test the argument builders; running the real CLIs is the owner's check at a gate. Running `claude` itself is fine.
