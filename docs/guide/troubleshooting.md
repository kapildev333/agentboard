# Troubleshooting

Start with `agentboard status --json`. It tells you whether a daemon answers, on which port and pid, and what every console's status is.

## The daemon did not start

**`agentboard: daemon did not start within 10 seconds`** (from `open`, `spawn` or `note`)

Those commands start `agentboard start` in the background with its output discarded. Run the daemon in the foreground once to see the real error:

```sh
cd ~/code/your-repo
agentboard start
```

The common causes:

| Message | Fix |
| --- | --- |
| `agentboard: cannot load the daemon: …` | The build is missing or stale: `npm run build` in the checkout |
| `Cannot find module '…/dist/bin.js'` | Same: build before using the linked `agentboard` |
| `invalid board file …/boards/<hash>.json: …` | A board file was edited by hand and no longer parses. Fix or remove that file (you lose that repository's layout) |
| `a daemon is already running (pid N, port P)` | See below |

**`agentboard: a daemon is already running (pid N, port P)`**

Only one daemon runs per `AGENTBOARD_HOME`, and it serves every repository. Use `agentboard open <path>` to reach the running one. To replace it, run `kill N`, then start again.

**A stale `daemon.json`.** If the daemon was killed with `kill -9` or the machine crashed, `daemon.json` stays behind:

- The CLI notices that nothing answers and starts a new daemon.
- If the old pid has since been reused by another process, the new daemon refuses to start with the message above. Delete `~/.agentboard/daemon.json` and try again.

## Port busy

`agentboard start` and `agentboard open` always ask the system for a free port, so they cannot hit a busy one.

Only the `agentboard-daemon` bin with `AGENTBOARD_PORT` set uses a fixed port. A port in use then fails at once:

```
agentboard-daemon: listen EADDRINUSE: address already in use 127.0.0.1:<port>
```

Pick another port, or leave `AGENTBOARD_PORT` unset. To find what holds a port, run `lsof -nP -iTCP:<port> -sTCP:LISTEN`. Stop it by its pid.

## node-pty: `posix_spawnp failed`

Spawning any console fails, with this in the spawn dialog or the CLI:

```
could not start <command>: posix_spawnp failed.
```

node-pty's prebuilt `spawn-helper` lost its execute bit, because `npm ci` runs with install scripts off. Fix it in the checkout and retry; the running daemon picks it up at once:

```sh
npm run fix-pty
```

Run `npm run fix-pty` after every `npm ci`. The same message also appears when the command does not exist at all: check a custom agent's **command** in Settings. On Linux there is no prebuilt binary; run `npm rebuild node-pty` instead.

## The login code expired

The page shows an empty `401`, or "Not logged in: run `agentboard open` in the repo to get a fresh login link." Possible causes:

- **The link is old.** A login link works once, within 60 seconds. Opening it twice, opening it late, or opening it after a restart gets 401.
- **The daemon restarted.** Its sessions are gone, and so is the port your tab was talking to.
- **The address changed.** You opened `localhost:<port>` after logging in on `127.0.0.1:<port>`, or the other way round. Cookies are per host name.

Run `agentboard open .` again for a fresh link.

## Status does not change, or hooks are not firing

First check that the console was launched by the board. Only board consoles carry `AGENTBOARD_URL`, `AGENTBOARD_CONSOLE_ID` and `AGENTBOARD_TOKEN`. In a board console's terminal:

```sh
echo "$AGENTBOARD_URL $AGENTBOARD_CONSOLE_ID"
```

A Claude session you started in a normal terminal never reports to the board, plugin or not. That is a known gap in this version.

Then, per agent:

- **Claude Code.**
  - The hooks run `node <checkout>/packages/daemon/dist/agents/notify-relay.js`. If you rebuilt or moved the checkout since the console started, use Resume to relaunch it.
  - Run `/hooks` inside the console to see the injected hooks.
  - A denied permission or an interrupt sends no Stop event, so the badge keeps its last state until the next turn.
- **Gemini CLI.** The hooks come from a temporary settings file named in `GEMINI_CLI_SYSTEM_DEFAULTS_PATH`. An admin policy that disables hooks also disables these.
- **OpenCode.** Install the plugin bundle in `~/.config/opencode/plugins/` ([Plugins](plugins.md#the-opencode-plugin)). The daemon's own pointer to `~/.agentboard/plugins/opencode/agentboard.ts` has nothing behind it in this version. Also check that `zod` resolves from the plugin's folder.
- **Codex.**
  - Codex reports only the end of a turn.
  - Working shows only after you press Enter in the console.
  - Needs you is never shown in this version.
- **Custom agents.**
  - A custom agent goes idle after 20 seconds without output.
  - It shows Needs you only when its output matches the regex in Settings. Test your regex against the exact text the CLI prints, and remember that output arrives in chunks, so a pattern spanning two lines may not match.
- **Every agent.** Until the first hook event arrives, a hook-driven console is judged by its output. If its badge flips between Working and Idle with no events behind it, the hooks are not reaching the daemon.

To see whether events arrive, watch the board file change: `~/.agentboard/boards/<hash>.json` records each console's `status` and `lastActiveAt`.

## `npx agentboard` runs something else

The unscoped npm package named `agentboard` is unrelated to this project. `npx agentboard` downloads and runs that package. AgentBoard has not been published to npm (ruling D33), so:

- Do not use `npx agentboard`, and do not `npm install -g agentboard`.
- Link the CLI from your checkout: `npm run build && npm link -w @agentboard/cli`.
- If you already installed the other package globally, remove it with `npm uninstall -g agentboard`, then link again.
- `which agentboard` should point into your npm prefix's `bin`, linked to `packages/cli/bin/agentboard.js` in your checkout.

The same holds for the MCP server: register `agentboard-mcp` from `npm link -w @agentboard/mcp`, or `node <checkout>/packages/mcp/bin/agentboard-mcp.js`, never `npx agentboard-mcp`.

## Other problems

| Symptom | Cause and fix |
| --- | --- |
| The spawn dialog says "not installed" for a CLI you have | The daemon reads PATH from your login shell (`$SHELL -ilc env`) once, at start. Fix your shell profile and restart the daemon |
| Spawn with a worktree fails with `internal error` | The branch or `.worktrees/<branch>` already exists. Pick another name, or remove the old one with `git worktree remove .worktrees/<branch>` and `git branch -d <branch>` |
| A closed console's worktree is still there | Closing a console never removes its worktree in this version. Remove it with `git worktree remove` |
| VS Code or Zed buttons answer `internal error` | `code` or `zed` is not on the daemon's PATH (the daemon logs nothing about it). Install the shell command, then restart the daemon from a shell that has it |
| **Open PR** fails | `gh` must be installed and logged in, and the branch pushed |
| `agentboard spawn custom` answers `unknown custom agent: undefined` | The CLI cannot choose a custom agent yet. Use the spawn dialog, or MCP `spawn_console` with `customId` |
| Mouse selection in a terminal is offset | Selection is only accurate at 100% zoom. Zoom to 100% to select |
| A note from MCP lands under another node | `add_note` places notes at the top-left. Drag it away |
