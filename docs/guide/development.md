# Development

The rules every change follows are in [CLAUDE.md](../../CLAUDE.md). The product is described in the [spec](../superpowers/specs/2026-10-23-agentboard-design.md), the order of work in the [build plan](../superpowers/plans/2026-10-23-multi-agent-build-plan.md), and every ruling in [issue #27](https://github.com/kapildev333/agentboard/issues/27).

## Workspace layout

TypeScript in strict mode, Node 22, ES modules, npm workspaces under `packages/`. Dependencies are pinned to exact versions (`save-exact`), install scripts are off (`ignore-scripts`), and installs use `npm ci` only.

| Package | Path | Contents |
| --- | --- | --- |
| `@agentboard/shared` | `packages/shared` | zod schemas for every type, message and route (`schemas.ts`); types inferred from them (`types.ts`); the WebSocket parsers (`protocol.ts`); the route table (`routes.ts`); the status table (`status-map.ts`); paths; fixtures |
| `@agentboard/daemon` | `packages/daemon` | `startDaemon` (`src/app.ts`) wires everything behind one server. Its parts live in folders: `server` (HTTP, WebSocket, login, Host and Origin checks), `pty` (node-pty, login-shell environment), `state` (boards, daemon.json), `status`, `agents` (catalog, launch and resume arguments, notify relay), `git`, `open`. The `agentboard-daemon` bin |
| `@agentboard/ui` | `packages/ui` | The React app: `board` (React Flow canvas, workspaces, zustand store), `console` (xterm.js node and its socket), `status`, `shell` (repo picker, spawn dialog, settings), `git`, `open`. Vite builds it into `packages/ui/dist` |
| `@agentboard/cli` | `packages/cli` | The `agentboard` bin: `start`, `open`, `status`, `spawn`, `note` |
| `@agentboard/mcp` | `packages/mcp` | The `agentboard-mcp` stdio server |
| `@agentboard/plugins` | `packages/plugins` | `claude/` (Claude Code plugin; the marketplace file is `.claude-plugin/marketplace.json` at the root) and `opencode/` (bundled with esbuild into `opencode/dist/agentboard.js`) |
| `@agentboard/e2e` | `packages/e2e` | Playwright specs, the fake agent, the L03 spike |

The bins in `packages/*/bin/*.js` are committed shims that import `../dist/bin.js`, so `npm link` works on a fresh clone before the first build.

## Commands

| Command | What it does |
| --- | --- |
| `npm ci && npm run fix-pty` | Install, then make node-pty's `spawn-helper` executable |
| `npm run build` | Build `shared` first, then every package that has a build script |
| `npm test` | Vitest across all packages (one project per package; tests import sibling packages from source, so no build is needed) |
| `npx vitest run --project daemon` | One package's tests (`shared`, `daemon`, `ui`, `cli`, `mcp`, `plugins`, `e2e`) |
| `npm run lint` | ESLint (recommended plus typescript-eslint recommended) |
| `npm run typecheck` | `tsc --noEmit` in every package |
| `npm run test:e2e` | Build, then run Playwright in `packages/e2e` |
| `scripts/gate.sh` | The full gate (below) |

The `ui` tests run in jsdom, and every other package runs in Node.

## The end-to-end tests

Install the browser once:

```sh
npx playwright install chromium
```

Then:

```sh
npm run test:e2e
```

Each daemon spec makes a temporary `AGENTBOARD_HOME` and a temporary git repository, and starts the built `agentboard-daemon` on a random port with `AGENTBOARD_AGENT_PATH` set to an empty folder, so the catalog finds no real agent. The tests log in through a one-time code like a user does.

| Spec | Checks |
| --- | --- |
| `smoke.spec.ts` | Six consoles spawned from the spawn dialog show live output, echo typed input and report working in their badges and the mission map |
| `load.spec.ts` | p95 keystroke echo under 50 ms while five other consoles print, and daemon memory under 1 GB after a minute of output |
| `restart.spec.ts` | A reload keeps six consoles and their status; after a daemon crash and restart they show Stopped, and Resume works |
| `security.spec.ts` | A foreign Origin carrying the board's cookie is refused on GET, PUT and WebSocket upgrades; a foreign Host is refused even with the token |
| `spike/l03.spec.ts` | The L03 renderer spike: echo through xterm.js in React Flow and frame rates at three zoom levels |

On the build machine the whole run took 1.4 minutes, with a p95 echo of 15.8 ms and a daemon RSS of 85 MB (533 MB with six fake agents).

The agent in every test is `packages/e2e/fake-agent/index.mjs`, registered as a custom agent with the needs-you rule `approve\?`:

- It prints a `fake> ` prompt and echoes what you type as `you said: <line>`.
- `ask` prints `approve? (y/n)`.
- `spam` prints a line every 10 ms until Ctrl-C.

No test ever runs codex, gemini, opencode or another third-party agent (ruling D31). macOS blocks unsigned binaries with a dialog, and running the real CLIs is the owner's check at a gate.

## Running the daemon on a build machine

Each time the spawn dialog opens (`GET /api/agents`), the agent catalog runs `<cli> --version` on every agent CLI it finds. On a machine with third-party agents installed, that executes them. Until the daemon can skip the probe (ruling D38), a worker or script that runs the daemon, the CLI or the MCP server follows two rules.

**1. Use a PATH with no third-party agent on it.** Make a scratch bin folder inside your worktree that holds only symlinks to `node`, `npm`, `git`, `gh`, `sh` and the fake agent. Put `PATH=<that folder>` in front of every daemon, CLI and MCP command. Before any run, check that `PATH=<that folder> command -v codex` prints nothing; do the same for `gemini` and `opencode`.

**2. Narrow the catalog's PATH as well.** The PATH from rule 1 is not enough on its own. The daemon reads PATH again from your login shell (`$SHELL -ilc env`), and on macOS the login files rebuild it, so `/usr/local/bin` comes back. Run the daemon through the `agentboard-daemon` bin with `AGENTBOARD_AGENT_PATH` set to an empty folder, the way the e2e does:

```sh
mkdir -p /tmp/empty-agent-path
AGENTBOARD_HOME=<scratch home> AGENTBOARD_AGENT_PATH=/tmp/empty-agent-path \
  PATH=<scratch bin> node packages/daemon/bin/agentboard-daemon.js
```

Start that daemon before any `agentboard open`, `spawn` or `note`, so those commands reuse it instead of starting their own. `agentboard start` and a daemon started by `agentboard open` scan the full login-shell PATH. Never open the spawn dialog on such a daemon on a build machine.

## The gate

`scripts/gate.sh` replaces CI. It runs from any worktree and prints `== gate: PASS` last. In order, it:

1. Runs `npm ci --prefer-offline`, then `npm run fix-pty`.
2. Runs lint, typecheck, the Vitest suite (`npm test`), the build, and `npm audit --audit-level=high`.
3. Runs `gitleaks detect` over the commits since `origin/main` (or `$GATE_BASE`). This covers documentation too.
4. Fails if any of those commits has an author other than the repository's noreply identity, or carries a `Co-Authored-By`, `Generated with` or `Signed-off-by` line.

It needs `gitleaks` on your PATH (`brew install gitleaks`). Its output replaces your home folder with `~`, so the last 20 lines can go into a pull request body as they are. The Playwright suite is not part of the gate; run `npm run test:e2e` yourself for UI or daemon changes.

## Working rules

The short version of [CLAUDE.md](../../CLAUDE.md):

- **Test first.** Write one failing Vitest test and run it red. Write the smallest code that passes and run it green. Commit `test:` then `feat:` (or `fix:`). Playwright lives only in `packages/e2e`.
- **Commits.** A short imperative subject starting with `feat:`, `fix:`, `test:` or `chore:` (documentation uses `chore:`). No attribution lines.
- **Dependencies.** A new dependency is pinned exactly and justified in one line in the pull request.
- **Secrets.** No secrets, tokens, hostnames, home paths or personal data in files, commits or logs.
- **Scratch servers.** Run them on a random free port and stop them by PID or by that port.
- **Third-party agents.** Never install or run third-party agent CLIs on the build machine. Build and unit-test their argument builders instead.

## Spikes

The phase 0 spikes recorded their findings in `docs/spikes/`:

| Spike | Finding |
| --- | --- |
| L02 | PTY over WebSocket: p95 echo 0.4 to 0.6 ms, about 3 MB per shell |
| L03 | xterm.js in React Flow: the DOM renderer stays sharp at every zoom, so WebGL is not used |
| L04 | Claude Code: inline `--settings` hooks merge with your own, and `--resume` brings a session back |
| L05 | OpenCode: plugin events and the session id; the binary was not run, per D10 |
| L06 | Codex notify and Gemini hooks per launch, from documentation, per D10 |
