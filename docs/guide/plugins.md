# Plugins and per-launch hooks

Every agent the board launches reports its status to the daemon at `POST /hook/<console id>`. The daemon sets this up per launch and never edits your own configuration. The two plugins add things the per-launch setup cannot: a `/board` command in Claude Code, and an `agentboard_spawn` tool plus status events in OpenCode.

## What the daemon sets up at launch

| Agent | How it is hooked | Your config |
| --- | --- | --- |
| Claude Code | `--settings '{"hooks":…}'` with command hooks for `UserPromptSubmit`, `PreToolUse`, `Stop`, `Notification`, `PermissionRequest`, `SessionEnd`. Inline settings merge with your user, project and plugin hooks, so yours still run | Untouched |
| Codex | `-c notify=["<node>","<relay>"]` overrides `notify` for this launch only. Codex runs the relay after each turn | Untouched, but your own `notify` command does not run inside board consoles: the override replaces it, as `notify` takes one command (L06) |
| Gemini CLI | A settings file holding `BeforeAgent`, `AfterAgent` and `Notification` hooks, written to a private temporary folder and passed as `GEMINI_CLI_SYSTEM_DEFAULTS_PATH`, Gemini's lowest-precedence layer. Hook lists merge, so yours still run | Untouched |
| OpenCode | `OPENCODE_CONFIG_CONTENT='{"plugin":["file://<checkout>/packages/plugins/opencode/dist/agentboard.js"]}'` loads the plugin bundle from your checkout for this launch | Untouched |

The Claude, Codex and Gemini hooks all run the daemon's notify relay, `packages/daemon/dist/agents/notify-relay.js`, with the same Node binary that runs the daemon. The relay posts the event to the daemon as `{agent, event, payload}`:

- It reads the event JSON from stdin, or from its last argument for Codex.
- It reads the address, console id and token from the environment, so the token never shows up in `ps`.
- It gives up after 2 seconds and always exits 0, so a stopped daemon never breaks the agent.

## The Claude Code plugin

`packages/plugins/claude`, published through the marketplace file `.claude-plugin/marketplace.json` at the root of the repository.

```sh
claude plugin marketplace add kapildev333/agentboard      # needs read access to the repository
claude plugin marketplace add /path/to/your/agentboard    # or: your local checkout
claude plugin install agentboard@agentboard
```

The plugin brings two things:

- **`/board`** runs `agentboard open .` and reports the URL. It needs `agentboard` on your PATH (see [Getting started](getting-started.md)). If the command is missing, Claude says so and points to `npm link -w @agentboard/cli`. It never falls back to `npx`.
- **Status hooks** for `Stop`, `Notification`, `UserPromptSubmit`, `PermissionRequest`, `PreToolUse` and `SessionEnd`. Each runs `node "${CLAUDE_PLUGIN_ROOT}/hooks/post.mjs"` with a 5-second timeout. The script forwards the hook's stdin to `$AGENTBOARD_URL/hook/$AGENTBOARD_CONSOLE_ID` with the token header.

The hooks report only for consoles the board launched, because only those carry `AGENTBOARD_URL` and `AGENTBOARD_CONSOLE_ID`:

- In any other Claude session they exit at once, print nothing and never slow the session.
- A plain `claude` started in a terminal does not get a console on the board in this version; adopting outside sessions is planned for a later phase.
- A board-launched console with the plugin installed posts each event twice, once from the plugin and once from the launch hooks. The status tracker ignores the repeat.

Board-launched Claude consoles report status with or without the plugin. Install it for `/board`.

## The OpenCode plugin

`packages/plugins/opencode`: one bundled file, `@agentboard/opencode-plugin` 0.1.0, MIT.

### Build and install

`npm run build` (or `npm run build -w packages/plugins` alone) writes the bundle to `packages/plugins/opencode/dist/agentboard.js`.

**There is nothing to install.** Every OpenCode console the board launches loads the bundle from your checkout through `OPENCODE_CONFIG_CONTENT`. Its `zod` import resolves from the checkout's `node_modules`.

Do not install it globally in `~/.config/opencode/plugins/` or `opencode.json`. Outside a board console it does nothing: it sends no events, and its tool answers "AgentBoard is not running". Inside a board console a global copy only loads the plugin a second time. Never copy the source folder anywhere OpenCode loads plugins from either: OpenCode calls every export of every file there, and the helper file breaks its loader.

### What it does

- **Status events.** In a board console it forwards `session.created`, `session.status`, `session.idle`, `permission.asked` and `tool.execute.before` to the daemon with the token header. Each post gives up after 1 second. The daemon takes the session id for Resume from `session.created`.
- **The `agentboard_spawn` tool.** The agent can open another agent as a new console. Its arguments:
  - `agent` (`claude`, `codex`, `gemini`, `opencode`, `custom`)
  - `cwd` (the directory the new agent starts in)
  - `worktree` (optional, a branch for a fresh git worktree)
  - `prompt` (optional, the first message)

  The new console lands next to the calling console. The tool answers `Opened console <id> on the AgentBoard at <url>`, or `AgentBoard is not running` when it is outside a board console or the daemon refuses.

Outside a board console the plugin forwards nothing, and the tool answers `AgentBoard is not running` without sending anything.

## Codex and Gemini CLI

Codex and Gemini need no plugin: the per-launch setup above covers their status. To let them open consoles, register the MCP server ([CLI and MCP](cli-and-mcp.md#registering-it)) or let them run `agentboard spawn` from their shell tool.

## Custom agents

A custom agent gets the same four environment variables as any console: `AGENTBOARD_URL`, `AGENTBOARD_CONSOLE_ID`, `AGENTBOARD_TOKEN` and `AGENTBOARD_AGENT=custom`. Its events are accepted at `POST /hook/<id>`, but no status-map row exists for `custom`, so they do not change its status. A custom agent's status comes from its output; see [Status and security](status-and-security.md).
