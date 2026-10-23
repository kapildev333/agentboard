# The CLI and the MCP server

Any agent that can run a shell command or call an MCP tool can drive the board. Both routes find the daemon through `~/.agentboard/daemon.json` (or `$AGENTBOARD_HOME/daemon.json`) and send its token in the `X-AgentBoard-Token` header.

## `agentboard`

Link it once from the checkout with `npm link -w @agentboard/cli`. Never use `npx agentboard`: that npm name belongs to an unrelated package.

```
usage: agentboard <start | open [path] | status | spawn <agent> | note <text>>
```

Any other first word prints that line and exits 2. Only `status` takes `--json`. `spawn` and `note` always print one line of JSON, and `open` and `start` print a URL.

`open`, `spawn` and `note` start the daemon when none answers. First they check that the target folder exists, so a typo never starts a daemon. Then they run `agentboard start` detached in that folder and wait up to 10 seconds. If it exits first, they fail with `daemon exited (<code>); run agentboard start to see why`, and if it never answers, with `daemon did not start within 10 seconds`. `status` never starts one.

### `agentboard open [path]`

Opens the board for `path` (default `.`) in your browser, and prints the URL it opened:

```sh
$ agentboard open .
http://127.0.0.1:61152/?code=<one-time code>&repo=%2Fpath%2Fto%2Fapp
```

- `path` must be a directory. Otherwise it prints `agentboard: not a directory: <path>` and exits 1.
- The board is keyed by the absolute path exactly as given, so open a repository from its root.
- The code in the URL works once, within 60 seconds.
- The browser is opened with `open` (macOS), `xdg-open` (Linux) or `start` (Windows). When none of them works, the printed URL is still there to paste.

### `agentboard status [--json]`

```sh
$ agentboard status
{"alive":true,"port":61152,"pid":60116}

$ agentboard status --json
{"alive":true,"port":61152,"pid":60116,"consoles":[{"id":"27fda5d6-…","title":"Fake","agent":"custom","status":"working"}]}

$ agentboard status          # no daemon
{"alive":false}              # exit code 1
```

- Exit 0 when a daemon answers, 1 when none does or on an error (printed as `{"error":"…"}`).
- `consoles` lists every console on every board the daemon has loaded since it started, across all workspaces. Each status is one of `stopped`, `starting`, `working`, `idle`, `needs_you` or `exited`.

### `agentboard spawn <agent> [options]`

Starts a console and prints it as JSON.

| Option | Meaning |
| --- | --- |
| `<agent>` | `claude`, `codex`, `gemini` or `opencode` |
| `--worktree <branch>` | Create `.worktrees/<branch>` on a new branch from the repository's current branch, and start there |
| `--prompt <text>` | First message for the agent |
| `--repo <path>` | Working directory for the console (default: the current directory) |

```sh
$ agentboard spawn claude --worktree fix-login --prompt "reproduce the login bug"
# abridged:
{"id":"…","type":"console","title":"Claude: fix-login","agent":"claude","cwd":"/…/app/.worktrees/fix-login","worktree":{"path":"…","branch":"fix-login","base":"main"},"status":"starting",…}
```

- **Parent console.** Inside a board console, `AGENTBOARD_CONSOLE_ID` is set. `spawn` passes it as `callerConsoleId`, so the new console opens in the same workspace, to the right of its parent. An empty value is ignored.
- **Board.** Outside the board, the console goes to the loaded board whose repository contains the working directory.
- **Errors** print `{"error":"…"}` and exit 1:
  - A wrong number of arguments prints the usage line.
  - An unknown agent prints `unknown agent: <name> (claude|codex|gemini|opencode|custom)`.
  - A `--repo` that is not a directory prints `not a directory: <path>`.
  - An agent with no executable on the agent PATH prints `<agent> is not on the agent PATH`.
- **Custom agents** cannot be spawned from the CLI in this version: `agentboard spawn custom` answers `{"error":"unknown custom agent: undefined"}`. Use the spawn dialog.

### `agentboard note <text> [--repo <path>]`

```sh
$ agentboard note "check the login flow before merging"
{"id":"6f6c1681-…"}
```

- The note goes on the active workspace of the board for `--repo`. Without `--repo`, it goes to the main repository root of the current directory: from a subfolder or a linked worktree, that is the main checkout.
- The words after `note` are joined with spaces. An empty note prints the usage line and exits 1.
- The note is placed under the lowest node, at the left edge of the existing nodes.

### `agentboard start`

Runs the daemon in the foreground, with the current directory's board loaded, and prints its address (never the token):

```sh
$ agentboard start
http://127.0.0.1:61152
```

- Ctrl-C or SIGTERM stops it cleanly.
- When another daemon already answers for the same `AGENTBOARD_HOME`, it prints `agentboard: a daemon is already running (pid <pid>, port <port>)` and exits 1.
- `start` always picks a random free port. The lower-level `agentboard-daemon` bin (in `packages/daemon/bin`) does the same job, and `AGENTBOARD_PORT` pins its port.
- `AGENTBOARD_AGENT_PATH`, read by every daemon however it starts (`start`, `open`, `spawn`, `note` or `agentboard-daemon`), sets the agent PATH. Agents are listed and run from that PATH instead of the login shell's. The end-to-end tests set it to an empty folder.

### Environment variables

| Variable | Read by | Meaning |
| --- | --- | --- |
| `AGENTBOARD_HOME` | daemon, CLI, MCP | State folder instead of `~/.agentboard` |
| `AGENTBOARD_CONSOLE_ID` | CLI `spawn`, MCP `spawn_console` | Parent console; set by the daemon inside every console |
| `AGENTBOARD_PORT` | `agentboard-daemon` only | Fixed port |
| `AGENTBOARD_AGENT_PATH` | daemon | The agent PATH: where agents are found and run from (default: the login shell's PATH) |

## `agentboard-mcp`

An MCP server over stdio, built on the official TypeScript SDK. Link it with `npm link -w @agentboard/mcp`, or call `node <checkout>/packages/mcp/bin/agentboard-mcp.js` directly.

The server does not start the daemon. It reads `daemon.json` on every call, so it follows a daemon that restarted. With no daemon running, each tool returns an error result such as `ENOENT: no such file or directory, open '…/daemon.json'`. Run `agentboard open .` first.

### Tools

| Tool | Arguments | Returns |
| --- | --- | --- |
| `open_board` | `repo` (string, absolute path) | The board as JSON: workspaces and nodes. It does not open a browser |
| `spawn_console` | `agent` (`claude`, `codex`, `gemini`, `opencode`, `custom`), `cwd` (string), optional `worktree`, `prompt`, `callerConsoleId`, `customId` | The new console |
| `list_consoles` | none | Every console the daemon has loaded, with id, agent, cwd, status and more |
| `add_note` | `text` (string) | The note. It goes on the board last opened through `open_board` in this server, or the server's working directory, at the top-left of the active workspace |
| `get_status` | none | `{"consoles":[…]}` |

- `spawn_console` takes `callerConsoleId` from `AGENTBOARD_CONSOLE_ID` when you leave it out.
- `spawn_console` with `agent: "custom"` needs the custom agent's `customId`, from `~/.agentboard/settings.json`.
- Invalid arguments come back as an MCP error result naming the field, for example `Invalid option: expected one of "claude"|"codex"|"gemini"|"opencode"|"custom" at agent`.

A quick check by hand:

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}' \
  | agentboard-mcp
# {"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"agentboard","version":"0.0.0"}},"jsonrpc":"2.0","id":1}
```

### Registering it

**Claude Code**

```sh
claude mcp add agentboard -- agentboard-mcp
claude mcp list        # agentboard should show as connected
```

**Codex**, in `~/.codex/config.toml`:

```toml
[mcp_servers.agentboard]
command = "agentboard-mcp"
args = []
```

**Gemini CLI**, in `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "agentboard": { "command": "agentboard-mcp" }
  }
}
```

**OpenCode**, in `opencode.json`:

```json
{
  "mcp": {
    "agentboard": { "type": "local", "command": ["agentboard-mcp"] }
  }
}
```

If the agent cannot find `agentboard-mcp` (a GUI-launched agent with a short PATH), use the absolute path, `node <checkout>/packages/mcp/bin/agentboard-mcp.js`, as the command.

## The HTTP API

The CLI, the MCP server and the plugins all use the same routes, defined in `packages/shared/src/routes.ts` and validated with the schemas in `packages/shared/src/schemas.ts`. Every route needs the token header. Bodies and answers are JSON.

| Route | Purpose |
| --- | --- |
| `GET /api/board?repo=<path>`, `PUT /api/board` | Read or replace a board |
| `POST /api/consoles` | Spawn `{agent, cwd, worktree?, prompt?, callerConsoleId?, customId?}` |
| `DELETE /api/consoles/:id` | Close a console |
| `POST /api/consoles/:id/resume` | Resume a stopped or exited console |
| `GET /api/agents` | The agent catalog |
| `GET /api/status` | Every loaded console |
| `POST /hook/:consoleId` | Status events `{agent, event, payload}` from hooks and plugins |
| `GET /api/git/status?path=`, `GET /api/git/diff?path=` | Git card data |
| `POST /api/git/worktree`, `/commit`, `/push`, `/pr` | Git actions |
| `GET /api/settings`, `PUT /api/settings` | Settings |
| `POST /api/open` | `{editor: "code" \| "zed" \| "finder", path}` |
| `POST /auth/code` | A one-time browser login code (token header only) |

Errors are `{"error":"…"}`. The status codes:

- 400 for an invalid request or a client mistake, such as a bad path or a missing binary.
- 404 for an unknown console.
- 409 for resuming a console that is still running.
- 413 for a body over 1 MB.
- 500 for anything else.
