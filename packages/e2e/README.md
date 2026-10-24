# @agentboard/e2e

Playwright tests against a real daemon (the built `agentboard-daemon` bin) on a random free port, with `AGENTBOARD_HOME` and a git repo in a temp dir. No third-party agent runs (ruling D31): `fake-agent/index.mjs` is registered as a custom agent and plays every agent.

## Run

```bash
npm ci && npm run fix-pty        # once per clone
npx playwright install chromium  # once per machine; the only network step, and the owner's
npm run test:e2e                 # from the repo root: builds the workspace, then runs every spec
```

`npm run test:e2e` takes about 100 s on an M-series Mac: about 5 s to build, then about 95 s for the specs. The load spec takes 1 min of that. It is not part of `scripts/gate.sh`. To run one spec once the workspace is built, use `cd packages/e2e && npx playwright test scenario.spec.ts`.

## Specs

- `smoke.spec.ts`: six fake consoles show live output and status (L1A).
- `load.spec.ts`, `restart.spec.ts`, `security.spec.ts`: keystroke latency and memory, reload and restart, and origin checks (L1A).
- `scenario.spec.ts`: the phase 2 gate (L27). Console A is spawned from the UI. From inside A the fake agent runs `agentboard spawn custom --id fake --worktree feature-b` and calls the MCP tools `spawn_console` (worktree feature-c) and `list_consoles`. Consoles B and C each commit a README.md change through their git card. Both branches show, the main checkout stays untouched, and `agentboard status --json` lists all three consoles.
- `spike/l03.spec.ts`: the L03 renderer spike.

## Fake agent cues

`makeHome(cues)` in `daemon.ts` writes a cues file and passes its path to the fake agent. When you type a cue's name into a console, the agent runs that cue the way a real agent's tools would:

- `{ sh: "agentboard spawn ..." }` runs through `sh -c`.
- `{ mcp: [{ name, arguments }] }` starts `agentboard-mcp` over stdio, sends `initialize`, then sends one `tools/call` per entry.

Cues run with the built `agentboard` and `agentboard-mcp` bins first on PATH and with `AGENTBOARD_HOME` pinned to the temp home, so they never reach your own daemon. The results go to `<cues file>.<name>.json`, and the console prints `cue <name> ok` or `cue <name> failed: <why>`.
