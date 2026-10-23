# AgentBoard plugin for Claude Code

```
claude plugin marketplace add kapildev333/agentboard
claude plugin install agentboard@agentboard
```

Then run a plain `claude` session while the AgentBoard daemon is running: it appears as a node on the board, and its Stop, Notification, UserPromptSubmit, PermissionRequest, PreToolUse and SessionEnd events update the node's status. `/board` opens the current repo on the board.

The hooks exit silently when the daemon is not running (or `AGENTBOARD_URL` / `AGENTBOARD_CONSOLE_ID` are unset), so the plugin never slows or breaks a session.
