# agentboard-mcp

An MCP server over stdio. It lets a coding agent open the board, spawn consoles, list them, add notes and read status. The AgentBoard daemon must be running; the server reads `~/.agentboard/daemon.json` (or `$AGENTBOARD_HOME/daemon.json`).

Tools: `open_board`, `spawn_console`, `list_consoles`, `add_note`, `get_status`.

## Claude Code

```
claude mcp add agentboard -- npx agentboard-mcp
claude mcp list
# agentboard should show as connected
```

## Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.agentboard]
command = "npx"
args = ["agentboard-mcp"]
```

## Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "agentboard": { "command": "npx", "args": ["agentboard-mcp"] }
  }
}
```

## OpenCode

`opencode.json`:

```json
{
  "mcp": {
    "agentboard": { "type": "local", "command": ["npx", "agentboard-mcp"] }
  }
}
```
