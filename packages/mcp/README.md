# agentboard-mcp

An MCP server over stdio. It lets a coding agent open the board, spawn consoles, list them, add notes and read status. The AgentBoard daemon must be running; the server reads `~/.agentboard/daemon.json` (or `$AGENTBOARD_HOME/daemon.json`).

The package is private and unpublished, so register the linked bin and never a bare `npx agentboard-mcp` (that name on the public registry is not ours):

```
npm run build -w @agentboard/mcp
npm link -w @agentboard/mcp    # puts agentboard-mcp on PATH
```

Without `npm link`, use `node <repo>/packages/mcp/dist/bin.js` in place of `agentboard-mcp` below.

Tools: `open_board`, `spawn_console`, `list_consoles`, `add_note`, `get_status`.

## Claude Code

```
claude mcp add agentboard -- agentboard-mcp
claude mcp list
# agentboard should show as connected
```

## Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.agentboard]
command = "agentboard-mcp"
args = []
```

## Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "agentboard": { "command": "agentboard-mcp" }
  }
}
```

## OpenCode

`opencode.json`:

```json
{
  "mcp": {
    "agentboard": { "type": "local", "command": ["agentboard-mcp"] }
  }
}
```
