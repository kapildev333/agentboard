# AgentBoard

AgentBoard is a free local tool for running coding agents side by side. A small Node daemon on your machine runs coding-agent CLIs (Claude Code, Codex, Gemini CLI, OpenCode or any command you name) as real terminals, and your browser shows them as consoles on a zoomable board. Each console can get its own git worktree and branch. A status badge on every console tells you which agent is working, idle or waiting for you. Any CLI can drive the board through the `agentboard` command, the MCP server or a plugin. It needs no account and has no server or telemetry. The daemon listens only on 127.0.0.1.

This is version 0.1 (unreleased), built from source. The user guide in [docs/guide](docs/guide) covers every flag and option.

## Who it is for

AgentBoard is for a developer who runs several agent sessions a day across a few repositories, on any mix of subscriptions, API keys and local models. It replaces a row of terminal tabs: you see at a glance which agent needs you, two agents on one task stay out of each other's files, and the board is still there when you come back tomorrow.

## Quick start

You need macOS, Node 22, git and a browser. Linux has not been tested. node-pty ships no Linux prebuild, so on Linux you need a C++ toolchain, and `npm rebuild node-pty --ignore-scripts=false` replaces `npm run fix-pty`. On macOS:

```sh
git clone https://github.com/kapildev333/agentboard.git
cd agentboard
npm ci
npm run fix-pty                  # makes node-pty's spawn-helper executable (install scripts are off)
npm run build
npm link -w @agentboard/cli      # puts `agentboard` on your PATH
cd ~/code/your-repo
agentboard open .
```

If `npm link` fails with `EACCES`, your global npm folder belongs to root, which the nodejs.org installer sets up. Never use `sudo`. Point npm at a folder you own, put it on your PATH, and link again:

```sh
npm config set prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"     # add this line to your shell profile too
npm link -w @agentboard/cli
```

`agentboard open .` starts the daemon in the background if none is running, opens your browser and prints the address it opened:

```
http://127.0.0.1:61152/?code=<one-time code>&repo=<your repo path>
```

The browser logs in with the one-time code in that link. The code works once and expires after 60 seconds. The daemon swaps it for a session cookie and redirects to the same page without the code, so the code never stays in your history. The token in `~/.agentboard/daemon.json` never appears in a URL. If the browser did not open, paste the printed link within a minute. If you are too late, run `agentboard open .` again for a new code.

The page shows these parts:

- **Top bar:** the repo name, the workspace tabs (`main` at first, `+` for another), and the **Spawn console** and **Settings** buttons.
- **Canvas:** a dotted canvas with zoom controls and a minimap.
- **Mission map:** a panel on the right that lists every console by status.

To try it, click **Spawn console**, pick an agent the dialog found on your PATH and click **Spawn**. A terminal opens on the board. Click into it and type.

`agentboard status --json` answers from any terminal:

```json
{"alive":true,"port":61152,"pid":60116,"consoles":[{"id":"…","title":"Claude","agent":"claude","status":"idle"}]}
```

Never run `npx agentboard`. That npm name belongs to an unrelated package. AgentBoard is not published to npm yet, so the CLI is always linked from your checkout.

## Using the board

- **Spawn a console.** **Spawn console** lists `claude`, `codex`, `gemini` and `opencode`, plus your custom agents.
  - An agent counts as available when an executable file of that name is on the agent PATH; listing it never runs it.
  - "not installed" greys out the rest.
  - A version appears only after that agent's first console has started.

  The dialog has two options:
  - **New worktree** creates `.worktrees/<branch>` in the repo, on a new branch made from the current one, and starts the agent there. The console's title then names the branch.
  - **First prompt** goes to the agent as its opening message. Custom agents ignore it.

  Consoles fill a three-column grid. A console spawned by another console (through the CLI, MCP or the OpenCode tool) lands to the right of its parent.
- **Move around the board.** Scroll or use the trackpad to pan. Pinch, Cmd-scroll or the zoom controls zoom from 25% to 200%. The minimap and the fit-view button help on a big board.
  - Drag a console by its title bar. Select a console to resize it from its edges.
  - A terminal you clicked into takes every key and scroll.
  - Pressing Backspace with a node selected removes it, and that ends a console.
- **Workspaces.** Tabs in the top bar, each with its own consoles and view:
  - Click a tab to switch to it. Double-click it to rename it.
  - `+` adds a workspace. `×` deletes the active one at once, with no confirmation, and ends every console on it. The last workspace cannot be deleted.
- **Status badges and notifications.** Each console shows Starting, Working, Idle, Needs you, Exited or Stopped. The mission map groups the active workspace's consoles by status; click one to focus its terminal.
  - The tab title reads `(2) AgentBoard` while two consoles need you.
  - While the tab is hidden, a console that turns "needs you" raises a browser notification. Clicking the notification focuses that console.
  - The browser asks for notification permission on your first click or key press.
- **Resume.** The daemon keeps running when you close the tab, so reopening the board shows the live consoles. After the daemon restarts, every console comes back where it was as **Stopped**. **Resume** relaunches it with the agent's own resume command and session id. A console with no session id yet, and every custom agent, starts fresh.
- **The git card.** **Git** on a console opens a card for the console's folder:
  - It shows the branch, the ahead and behind counts, the number of dirty files and the last commit, refreshed every 10 seconds.
  - **Diff** lists changed files and shows the unified diff.
  - **Commit** stages everything (`git add -A`) and commits with your message.
  - **Push** runs `git push -u origin HEAD`.
  - **Open PR** runs `gh pr create` with the last commit's subject as the title and shows a link to the new pull request.
- **Open in VS Code, Zed or Finder.** These buttons sit under the git card. They run `code <path>`, `zed <path>`, or on macOS `open -R <path>`, which reveals the folder in Finder.
- **Notes.** `agentboard note "text"` or the MCP `add_note` tool adds a yellow note card to the active workspace. This version cannot create or edit notes from the page.
  - An open board does not show the new note, because the daemon tells no page about it.
  - The page's next save also deletes the note.
  - Reload the board right after adding a note, before you pan, zoom or drag anything.

  Lane L1B is fixing this.
- **Settings.**
  - **Font size** sets the terminal font size, 10 to 24.
  - **Custom agents** each have a name, a command, space-separated arguments and an optional "needs you" regular expression. Output that matches the expression marks the console as needing you.
  - Settings are saved to `~/.agentboard/settings.json` as you edit.

## Invoking it from any CLI

### The `agentboard` command

| Command | What it does | Prints |
| --- | --- | --- |
| `agentboard open [path]` | Starts the daemon if needed, opens the browser on the board for `path` (default `.`) | The login URL |
| `agentboard status [--json]` | Reports whether the daemon is running; `--json` adds every console's id, title, agent and status. Exits 1 when no daemon answers | `{"alive":true,"port":…,"pid":…}` |
| `agentboard spawn <agent> [--worktree <branch>] [--prompt <text>] [--repo <path>]` | Starts a console (`claude`, `codex`, `gemini` or `opencode`) and starts the daemon if needed | The console as JSON, or `{"error":…}` with exit 1 |
| `agentboard note <text> [--repo <path>]` | Adds a note to the board's active workspace | `{"id":…}` |
| `agentboard start` | Runs the daemon in the foreground for the current directory; Ctrl-C stops it | The daemon's address |

`spawn` and `note` always print one line of JSON, so an agent's shell tool can parse the result. When an agent inside a board console runs `agentboard spawn`, the new console opens next to it, because the daemon sets `AGENTBOARD_CONSOLE_ID` in every console.

### The MCP server

`agentboard-mcp` is an MCP server over stdio with five tools: `open_board`, `spawn_console`, `list_consoles`, `add_note` and `get_status`. It talks to a running daemon, so start one first with `agentboard open .`. Link it once:

```sh
npm link -w @agentboard/mcp      # puts agentboard-mcp on your PATH
```

Then register it:

- **Claude Code:** `claude mcp add agentboard -- agentboard-mcp`
- **Codex:** in `~/.codex/config.toml`, add `[mcp_servers.agentboard]` with `command = "agentboard-mcp"`
- **Gemini CLI:** in `~/.gemini/settings.json`, add `"mcpServers": { "agentboard": { "command": "agentboard-mcp" } }`
- **OpenCode:** in `opencode.json`, add `"mcp": { "agentboard": { "type": "local", "command": ["agentboard-mcp"] } }`

### The Claude Code plugin

The plugin adds a `/board` command, which runs `agentboard open .`, and status hooks. Install it from this repository's marketplace file:

```sh
claude plugin marketplace add kapildev333/agentboard     # or the path to your checkout
claude plugin install agentboard@agentboard
```

The hooks report status only for Claude sessions the board launched. A plain `claude` session started in a terminal does not get a console on the board in this version. Board-launched Claude consoles report status without the plugin as well, because the daemon injects the same hooks at launch.

### The OpenCode plugin

`npm run build` bundles the plugin into one file, `packages/plugins/opencode/dist/agentboard.js`. The plugin does two things:

- It forwards session status to the board.
- It gives the agent an `agentboard_spawn` tool that opens another agent as a new console.

OpenCode consoles the board launches load this bundle from your checkout on their own, so there is nothing to install. A global install in `~/.config/opencode/plugins/` adds nothing: outside a board console the plugin sends no events, and its tool answers "AgentBoard is not running".

## Status model

| Agent | Signal | Working | Idle | Needs you |
| --- | --- | --- | --- | --- |
| Claude Code | Hooks injected per launch with `--settings` (your own hooks still run) | `UserPromptSubmit`, `PreToolUse` | `Stop` | `PermissionRequest`, or `Notification` of type permission prompt, idle prompt, input or elicitation |
| Gemini CLI | Hooks from a private settings file given through `GEMINI_CLI_SYSTEM_DEFAULTS_PATH` | `BeforeAgent` | `AfterAgent` | `Notification` |
| OpenCode | Plugin events | `session.status` busy, `tool.execute.before` | `session.idle` | `permission.asked` |
| Codex | `notify` set per launch with `-c` | Output after you press Enter | `agent-turn-complete` | No signal in this version |
| Custom | Output | Any output | 20 seconds without output | Output matching your regex, held until you type |

How a status changes:

- Every console starts as **Starting**.
- Until a hook-driven agent (Claude, Gemini, OpenCode) sends its first event, it is judged by its output like a custom agent: output means working, and 20 quiet seconds mean idle. That way a broken hook degrades to a guess instead of a frozen badge.
- The process exiting marks the console **Exited**.
- Hook posts that carry a different session id are ignored, for example from a nested `claude -p` run. After Claude's `/clear` or `/resume`, the console adopts the next session id once (D39).

## Security model

- **Loopback only.** The daemon listens on 127.0.0.1, on a random port.
- **A token for scripts.** The daemon makes a fresh 256-bit token at each start and writes it to `~/.agentboard/daemon.json` (mode 600). The CLI, the MCP server and the hooks send it as `X-AgentBoard-Token` or `Authorization: Bearer`, and the daemon compares it in constant time. The token is never accepted in a URL.
- **One-time codes and a cookie for the browser.** Only a caller holding the token can get a code, from `POST /auth/code`. Each code is single-use and expires after 60 seconds. The code buys an `HttpOnly`, `SameSite=Strict` session cookie named after the port, and the cookie holds a random session id, never the token.
- **Header checks on every request and WebSocket.** The daemon refuses a request with 403 when any of these fails:
  - `Host` must be `127.0.0.1:<port>` or `localhost:<port>`, which stops DNS rebinding.
  - An `Origin`, when present, must be the board's own origin.
  - A `Sec-Fetch-Site`, when present, must be `same-origin` or `none`.
  - A request authenticated by the cookie must prove it came from the board, which every write and WebSocket does with its `Origin`.
- **Everything else is refused.** A missing or wrong token or session gets 401. The daemon sends no CORS headers, and the page cannot be framed (`frame-ancestors 'none'`).

## Where state lives

All state lives in `~/.agentboard`. Set `AGENTBOARD_HOME` to use another folder.

| File | Holds |
| --- | --- |
| `daemon.json` | Port, token and pid of the running daemon (mode 600); removed when it stops |
| `boards/<sha1 of repo path>.json` | One board per repository: workspaces, nodes, layout, session ids. Written atomically |
| `settings.json` | Font size and custom agents |

One daemon runs per `AGENTBOARD_HOME` and serves every repository's board.

## Development

The code is TypeScript (strict) on Node 22, in npm workspaces under `packages/`:

| Package | What it is |
| --- | --- |
| `shared` | zod schemas, HTTP route table, WebSocket protocol, status map |
| `daemon` | `startDaemon`, the HTTP and WebSocket server, PTYs, state, status, agents, git, open-in, and the `agentboard-daemon` bin |
| `ui` | The React board (React Flow, xterm.js), built by Vite into `ui/dist` |
| `cli` | The `agentboard` command |
| `mcp` | The `agentboard-mcp` server |
| `plugins` | The Claude Code plugin and the OpenCode plugin |
| `e2e` | Playwright tests and a fake agent |

Commands for development:

```sh
npm test                         # Vitest, every package
npm run lint && npm run typecheck
npx playwright install chromium  # once, for the end-to-end tests
npm run test:e2e                 # builds, then runs Playwright against the real daemon
scripts/gate.sh                  # the full gate: ci, lint, typecheck, tests, build, audit, gitleaks; ends in PASS
```

The end-to-end tests drive a fake agent registered as a custom agent. No test runs codex, gemini, opencode or any other third-party agent. See [docs/guide/development.md](docs/guide/development.md).

## What is not in this version

These parts of the [design spec](docs/superpowers/specs/2026-10-23-agentboard-design.md) are not built yet:

- **Real Codex, Gemini CLI and OpenCode runs.** These three CLIs were never run as the real programs in this build (rulings D10 and D31). Their launch arguments, hooks and plugin are unit-tested and written from their documentation; running them is the owner's check.
- **Outside sessions.** A `claude` session started outside the board does not get a console.
- **An `agentboard mcp` subcommand.** The spec names one; the MCP server is the separate `agentboard-mcp` bin instead.
- **Keyboard navigation between consoles.** Moving from one console to the next takes the mouse or the mission map.
- **Worktree cleanup.** Closing a console does not remove its worktree or warn about uncommitted work; remove it with `git worktree remove`. **Start fresh** is not offered beside **Resume**.
- **Codex needs-you.** Codex has no "needs you" signal yet, and no one-time hook setup with a visible diff exists for OpenCode, Codex or Gemini.
- **Board extras (phase 3):** web tiles, editable notes, checklists, image drop, ink and layout presets.
- **Orchestration (phase 4):** teams, handoff briefs, loops, a composer, profiles, token analytics and project memory. The mission map is the only part built so far.
- **Command bar and voice (phase 5).**
- **Studios (phase 6).**
- **Distribution (phase 7):** an npm or brew release, an installer, and Windows and Linux testing. Only macOS has been tested.

## How this was built

One governor session built AgentBoard. It split the plan into 27 lanes (L00 to L06, L10 to L1A, L20 to L28), ran them as background Claude Code workers in their own worktrees, and had Opus review every pull request. A local gate (`scripts/gate.sh`) stood in for CI, and pull requests merged by rebase only. Every choice the plan left open was recorded on the Decisions issue (#27). See the [spec](docs/superpowers/specs/2026-10-23-agentboard-design.md), the [build plan](docs/superpowers/plans/2026-10-23-multi-agent-build-plan.md) and [issue #27](https://github.com/kapildev333/agentboard/issues/27).

## License

MIT. The LICENSE file is added when the repository is made public.
