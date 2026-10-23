# @agentboard/opencode-plugin

Reports OpenCode session state to AgentBoard and gives the agent an `agentboard_spawn` tool to open another agent on the board.

Install: after `npm run build -w packages/plugins`, copy or symlink the one file `packages/plugins/opencode/dist/agentboard.js` into `~/.config/opencode/plugins/`,
or add `"plugin": ["file:///<path>/agentboard.js"]` to `opencode.json`. `zod` must resolve from there (OpenCode's own install provides it).

Env vars the daemon sets in each console: `AGENTBOARD_URL` (daemon base URL), `AGENTBOARD_CONSOLE_ID` (this console), `AGENTBOARD_TOKEN` (sent as `X-AgentBoard-Token`).

Without `AGENTBOARD_URL` and `AGENTBOARD_CONSOLE_ID` the plugin stays silent: it forwards no events, and `agentboard_spawn` answers "AgentBoard is not running" without sending anything.
