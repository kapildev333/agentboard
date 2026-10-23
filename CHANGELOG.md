# Changelog

## Unreleased

Phases 0 to 2 of the [build plan](docs/superpowers/plans/2026-10-23-multi-agent-build-plan.md), one line per lane, from the merged pull requests. Rulings are on issue #27.

- **L00** Foundation (#46): npm workspaces for shared, daemon, ui, cli, mcp, plugins and e2e; strict TypeScript; ESLint; Vitest with one project per package; `fix-pty` for node-pty's spawn-helper with install scripts off.
- **L01** Contracts (#35): zod schemas for every type, WebSocket message and HTTP route in `@agentboard/shared`, the route table, `mapSignal` as a data table of the status rules, and fixtures.
- **L02** PTY to WebSocket spike (#33): six shells over WebSockets with a p95 echo of 0.4 to 0.6 ms and about 3 MB per shell (`docs/spikes/L02.md`).
- **L03** xterm.js in React Flow spike (#36): six terminals at zoom 25% to 200%; the DOM renderer stays sharp where WebGL blurs, so the board uses DOM (`docs/spikes/L03.md`).
- **L04** Claude Code hooks spike (#40): inline `--settings` hooks merge with the user's own, `--session-id` and `--resume` work, and the Notification types are mapped (`docs/spikes/L04.md`).
- **L05** OpenCode plugin spike (#37): a plugin forwarding session events; the session id comes from `session.created` and resume uses `--session` (`docs/spikes/L05.md`).
- **L06** Codex and Gemini spike (#34): per-launch `notify` for Codex with `-c`, per-launch Gemini hooks through `GEMINI_CLI_SYSTEM_DEFAULTS_PATH`, and the notify relay (`docs/spikes/L06.md`).
- **L10** State store and daemon file (#55): one board per repository under `~/.agentboard/boards`, saved atomically with a 300 ms debounce, a version-0 migration, and `daemon.json` with mode 600.
- **L11** PTY manager (#39): spawn, write, resize, kill (SIGHUP, then SIGKILL after 5 s), a 200 KB replay buffer, and the login-shell environment read once.
- **L12** Server (#47): HTTP and WebSocket on 127.0.0.1; the token as a header or Bearer; one-time codes swapped for a port-named session cookie; Host, Origin and Sec-Fetch-Site checks; no CORS; static files.
- **L13** Status tracker (#51): hook events through the shared map, the 20 s quiet timer, needs-you rules, Codex armed by Enter, hooks taking over from output after the first event (D20), and only a process exit being final.
- **L14** Agent catalog and launch arguments (#62): finds claude, codex, gemini and opencode on PATH; builds the launch and resume arguments for each, plus custom agents; Claude reports through the notify relay (D15).
- **L15** Board canvas and workspaces (#38): React Flow with zoom 25% to 200%, minimap, drag and resize; workspace tabs with create, rename and delete; debounced autosave.
- **L16** Console node (#53): xterm.js (DOM renderer) with fit, 10,000 lines of scrollback, copy and paste, font size, a drag handle on the title bar, and mouse input unscaled for zoom.
- **L17** Status badges, mission map, notifications (#48): a WCAG AA badge per status, the mission map grouped by status, and a web notification plus an `(N)` tab title when a console needs you.
- **L18** Shell (#50): the repo picker with recent repositories, the spawn dialog from the agent catalog with worktree and first prompt, and the settings panel with font size and custom agents.
- **L19** CLI start, open, status (#41): the `agentboard` bin; `open` starts a detached daemon when none answers and logs the browser in with a one-time code, never the token.
- **L1A** Integration (#74): `startDaemon`, the `agentboard-daemon` bin and the React app wire every lane together; the agent catalog lists agents by PATH presence only and never runs one to scan (D38); Playwright tests cover six consoles, echo under load, memory, foreign-origin refusal, reload and restart.
- **L20** Git service (#43): worktrees under `.worktrees/<branch>` with an exclude entry; removal refusing dirty or unpushed work; status, diff, commit, push and `gh pr create`.
- **L21** Git card and diff view (#49): branch, ahead, behind, dirty count and last commit, refreshed every 10 s, with Diff, Commit, Push and Open PR.
- **L22** Open in VS Code, Zed or Finder (#65): `code`, `zed` and `open -R` (D23) on absolute, resolved directories only, with the buttons on the console.
- **L23** CLI spawn, note, status (#52): `spawn <agent> [--worktree] [--prompt] [--repo]`, `note <text> [--repo]` and `status --json`, all printing JSON and starting the daemon when needed.
- **L24** MCP server (#42): `agentboard-mcp` over stdio with `open_board`, `spawn_console`, `list_consoles`, `add_note` and `get_status`, plus registration snippets for Claude Code, Codex, Gemini CLI and OpenCode.
- **L25** Claude Code plugin (#66): a `/board` command and status hooks for board-launched consoles (D28), installable from `.claude-plugin/marketplace.json`.
- **L26** OpenCode plugin (#67): status events with the token header and an `agentboard_spawn` tool, shipped as one esbuild bundle (D27).
- **L27** Integration e2e (a console spawned from the CLI, two worktrees, a merge from the board): in review as PR #79 when this was written.
