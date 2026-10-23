# @agentboard/opencode-plugin

Reports OpenCode session state to AgentBoard and gives the agent an `agentboard_spawn` tool to open another agent on the board.

Install: after `npm run build`, copy or symlink `dist/agentboard.js` and `dist/hook.js` into `~/.config/opencode/plugins/`,
or add the package to the `plugin` list in `opencode.json`. `zod` must resolve from there (OpenCode's own install provides it).

Env vars the daemon sets in each console: `AGENTBOARD_URL` (daemon base URL), `AGENTBOARD_CONSOLE_ID` (this console), `AGENTBOARD_TOKEN` (sent as `X-AgentBoard-Token`).

Without `AGENTBOARD_URL` and `AGENTBOARD_CONSOLE_ID` the plugin stays silent: it registers no hooks and no tool, so OpenCode outside AgentBoard is untouched.
