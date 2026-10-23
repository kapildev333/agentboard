# AgentBoard plugin for Claude Code

```
claude plugin marketplace add kapildev333/agentboard
claude plugin install agentboard@agentboard
```

The hooks report Stop, Notification, UserPromptSubmit, PermissionRequest, PreToolUse and SessionEnd status for consoles the board launched, because only those carry `AGENTBOARD_URL` and `AGENTBOARD_CONSOLE_ID`. A plain `claude` session started elsewhere does not appear as a node yet: adopting an outside session is deferred to a later lane. Repeated posts are harmless, since the status tracker ignores a repeated status. `/board` runs `agentboard open .`, which needs the agentboard CLI on PATH (from the AgentBoard checkout: `npm run build && npm link -w @agentboard/cli`); `open` starts the daemon itself.

The hooks exit silently when the daemon is not running (or those variables are unset), so the plugin never slows or breaks a session.
