# @agentboard/opencode-plugin

Reports OpenCode session state to AgentBoard and gives the agent an `agentboard_spawn` tool to open another agent on the board.

Consoles the board launches load the bundle from the checkout on their own (after `npm run build`); nothing to install for them.

Install for a plain `opencode` session: after `npm run build -w packages/plugins`, copy or symlink the one file `packages/plugins/opencode/dist/agentboard.js` into `~/.config/opencode/plugins/`,
or add `"plugin": ["file:///<path>/agentboard.js"]` to `opencode.json`. The bundle imports `zod` at runtime, so it must resolve from the file's folder: a symlink into the checkout resolves the workspace's copy; a copied file needs `{"dependencies":{"zod":"4.6.7"}}` in `~/.config/opencode/package.json`.

Env vars the daemon sets in each console: `AGENTBOARD_URL` (daemon base URL), `AGENTBOARD_CONSOLE_ID` (this console), `AGENTBOARD_TOKEN` (sent as `X-AgentBoard-Token`).

Without `AGENTBOARD_URL`, `agentboard_spawn` answers "AgentBoard is not running" without sending anything. Without either `AGENTBOARD_URL` or `AGENTBOARD_CONSOLE_ID`, no session events are sent.
