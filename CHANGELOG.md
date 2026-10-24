# Changelog

## v0.1.0 (2026-10-24)

AgentBoard v0.1.0 is the first cut of the MVP: phases 0 to 2 of the plan are code-complete. It is a free local tool. A Node daemon runs coding-agent CLIs as terminals on a zoomable board in your browser, one git worktree per console, with status you can read at a glance, and any CLI can invoke it. This release is for dogfood on macOS from the checkout; nothing is published to npm yet.

### What is in this version

- **Daemon** (`agentboard-daemon`, `startDaemon`): PTY manager, board state saved atomically per repo under `~/.agentboard` with fsync before rename, a single-daemon rule, restart shows every console as stopped with a working Resume, and an agent catalog that never executes an agent binary just to list it.
- **Server**: loopback only; token in a header or as a Bearer; one-time login codes exchanged for an HttpOnly session cookie; Host, Origin and Sec-Fetch-Site checks; WebSocket frames validated against the shared schema, 1 MiB cap; every route from the shared route table wired.
- **Board**: React Flow canvas with workspaces, pan and zoom, drag and resize, a minimap and the mission map, status badges, web notifications and the tab badge, a repo picker, a spawn dialog with custom agents, settings, notes, and a board revision counter so a stale page never overwrites a newer board.
- **Consoles**: xterm.js terminals with 10,000 lines of scrollback, copy and paste, font size, truecolor, and pointer coordinates corrected at every zoom level (verified in a real browser from 0.5 to 2).
- **Status**: hooks for Claude Code (including PreToolUse), Codex notify, Gemini hooks, OpenCode plugin events, and output heuristics with a quiet timer for custom agents; hook-driven consoles fall back to output until their first hook arrives; nested sessions cannot report as their parent.
- **Git**: a worktree per console with the branch on the node, status with ahead and behind against the base branch, diff view, commit, push and pull request through gh, safe removal, open in VS Code, Zed or Finder (Finder reveals, never launches).
- **Integration**: the `agentboard` CLI (start, open, status --json, spawn, note) with daemon auto-start; an MCP server over stdio with open_board, spawn_console, list_consoles, add_note and get_status; a Claude Code plugin (marketplace manifest, /board command, status hooks); an OpenCode plugin shipped as one bundle with an agentboard_spawn tool.
- **Tests**: unit suites in every package, a Playwright smoke (six consoles, keystroke echo p95 under 16 ms against a 50 ms budget, daemon under 90 MB alone and about 530 MB with six fake agents against a 1 GB budget, foreign-origin refusal, reload and restart) and the final scenario where a fake agent spawns consoles through the CLI and the MCP server into two worktrees and both branches show on their git cards.

### Known limits and the owner's checks

- Codex, Gemini CLI and OpenCode were never executed during this build (macOS blocks unsigned binaries with a dialog, D10 and D31); tests use a fake agent. The first real run is the owner's check.
- The npm name `agentboard` belongs to an unrelated package, so nothing suggests `npx agentboard`; the CLI is linked from the checkout (D33). A release name is still to be chosen.
- macOS only for now: node-pty ships no Linux prebuild; Linux needs a rebuild with install scripts on.
- Two tabs on the same board are not supported (D42). A plain `claude` session outside the board does not get a node yet (D28). Right-click paste inside a terminal at a zoom other than 100 percent is a known gap.
- The five-day dogfood gate and the phase 2 gate (an OpenCode session spawning a second console in a worktree) are the owner's to judge (issue #76).

### How it was built

One governor session dispatched 29 lanes as background worker sessions, each reviewed by an Opus reviewer with mutation-style checks, gated locally instead of CI, and merged with rebase-only merges. Every decision is recorded on issue #27 (D1 to D42, owner to confirm).

### Merged pull requests

- #28 chore: board-init script, ignore lane briefs
- #30 chore: gate runs fix-pty after npm ci; tick-state script
- #31 chore: resume script, bgIsolation none, tick-state by worktree
- #32 chore: dispatch by dependency with stacking, PARALLEL 8, resume by session id
- #33 L02: Spike: PTY to WebSocket bridge, six shells, latency numbers
- #34 L06: Spike: Codex notify and Gemini hooks per launch
- #35 L01: Contracts: shared types, WebSocket protocol, HTTP routes, status map, fixtures
- #36 L03: Spike: xterm.js inside a React Flow node under zoom
- #37 L05: Spike: OpenCode plugin events with a local model
- #38 L15: Board canvas and workspaces
- #39 L11: PTY manager
- #40 L04: Spike: Claude Code hook injection, session ids, resume
- #41 L19: CLI: start, open, status
- #42 L24: MCP server
- #43 L20: Git service: worktrees, status, diff, commit, push, PR
- #45 chore: rebase-only merges (D11); workers never run agent binaries (D10)
- #46 L00: Foundation: workspace, lint, test, build, gate wiring
- #47 L12: Server: http, WebSocket, token, Host and Origin checks, static files
- #48 L17: Status badges, mission map, notifications
- #49 L21: Git card and diff view
- #50 L18: Shell: repo picker, spawn dialog, settings
- #51 L13: Status: hook endpoint, mapper, quiet timer
- #52 L23: CLI: spawn, note, status with JSON output
- #53 L16: Console node
- #54 chore: gate output never prints the home path
- #55 L10: State store and daemon file
- #56 chore: allow --force-with-lease after a rebase; rebase-lane script
- #57 chore: build shared first; build configs resolve @agentboard/shared through dist
- #58 chore: guard refuses claude run through a path or substitution for workers
- #59 chore: rebase-resolve script for the stacked-lane cascade
- #61 chore: gitleaks allowlist for the RFC 6455 sample key; rebase-resolve regenerates lockfiles
- #62 L14: Agent catalog, launch and resume arguments
- #63 chore: gate fails foreign-author commits; rebase-resolve drops copied chore commits
- #64 chore: rebuild-lane script, guard memory path
- #65 L22: Open in VS Code, Zed or Finder
- #66 L25: Claude Code plugin
- #67 L26: OpenCode plugin, production
- #68 chore: rebuild-lane drops copies of base commits
- #69 chore: merge gate checks out the PR head sha
- #70 chore: docs stop suggesting npx agentboard (D33)
- #72 chore: release script (D36)
- #73 chore: rebase-resolve merges manifests as a union
- #74 L1A: Integration and e2e smoke
- #75 L28: README and user guide
- #78 chore: release script keeps the Changelog header
- #79 L27: Integration e2e, CLI and MCP spawned consoles in worktrees
- #80 L1B: Board updates from the CLI and MCP reach open pages
- #82 chore: spec Board type carries rev (L1B)
- #83 L1C: spawn custom --id and ahead counts against the base branch
- #84 chore: v0.1.0 release notes draft
- #87 L29: Visual design pass

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
- **L1B** Board updates reach open pages (#80): every board save carries a `rev` the daemon raises; the daemon sends the saved board to every other open page, which merges it (notes and removals from the daemon, its own positions and viewport); a stale save is refused with 409 and the page re-reads.
- **L1C** `spawn custom --id` and ahead counts against the base branch: in review as PR #83 when this was written.
- **L20** Git service (#43): worktrees under `.worktrees/<branch>` with an exclude entry; removal refusing dirty or unpushed work; status, diff, commit, push and `gh pr create`.
- **L21** Git card and diff view (#49): branch, ahead, behind, dirty count and last commit, refreshed every 10 s, with Diff, Commit, Push and Open PR.
- **L22** Open in VS Code, Zed or Finder (#65): `code`, `zed` and `open -R` (D23) on absolute, resolved directories only, with the buttons on the console.
- **L23** CLI spawn, note, status (#52): `spawn <agent> [--worktree] [--prompt] [--repo]`, `note <text> [--repo]` and `status --json`, all printing JSON and starting the daemon when needed.
- **L24** MCP server (#42): `agentboard-mcp` over stdio with `open_board`, `spawn_console`, `list_consoles`, `add_note` and `get_status`, plus registration snippets for Claude Code, Codex, Gemini CLI and OpenCode.
- **L25** Claude Code plugin (#66): a `/board` command and status hooks for board-launched consoles (D28), installable from `.claude-plugin/marketplace.json`.
- **L26** OpenCode plugin (#67): status events with the token header and an `agentboard_spawn` tool, shipped as one esbuild bundle (D27).
- **L27** Integration e2e (a console spawned from the CLI, two worktrees, a merge from the board): in review as PR #79 when this was written.

