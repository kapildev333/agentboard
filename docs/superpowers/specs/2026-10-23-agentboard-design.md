# AgentBoard (Symvibe clone): PRD and execution plan

As of 2026-10-23, revised the same day after the decision to make it a free, CLI-invoked local tool rather than a paid desktop app. Shareable copy with diagrams: https://claude.ai/artifact/7rWPdyZX6xTDXzUCkzi42V

## What Symvibe is

Symvibe is a USD 19/month native macOS app that runs AI coding-agent CLIs as live terminals on one zoomable board (https://www.symvibe.com/). Each console is a real PTY running the user's own Claude Code, Codex or Gemini CLI login, so the app never touches model APIs or resells access. It launched on Product Hunt on 10 October 2026 with 73 upvotes, ranked #20 for the day, and was formerly called Hypervibe (https://www.producthunt.com/products/hypervibe-2).

| Area | What Symvibe does | Clone phase |
| --- | --- | --- |
| Board | Pan and zoom canvas; workspaces switched like tabs; layout presets; web tiles with localhost preview and a docked inspector; kanban, sticky notes, text, checklists, calendar; ink and image markup | 1 canvas, 3 tiles and notes |
| Consoles | Real PTY terminals where Ctrl-C, Vim and htop work; any CLI on PATH or a custom executable; catalog of 34 CLIs | 1 |
| Status | Mission map marks each console working, resting or needs you, driven by each CLI's own hooks | 1 |
| Git | Git card per repo with branches; GitHub panel for commit, push, pull; no per-agent worktree or branch yet, which the maker calls the next step | 2 |
| Orchestration | Teams with roles; handoffs that summarize the outgoing session into a brief for the next agent; loops on a schedule, on idle or on output, retired when a goal is met; composer launches up to 12 consoles | 4 |
| Voice | Push-to-talk; on-device transcription; hosted planner (Groq) that moves the board and answers aloud (Inworld); 10,000 credits per month; destructive steps wait for confirmation | 5 |
| Studios | Document (repo to doc, paginated PDF); diagram (PNG, .excalidraw); code (file tree, pinned files); markdown vault with link graph | 6 |
| Continuity | State as versioned JSON on disk; consoles relaunch in place and offer each CLI's native resume; multiple account profiles; token analytics from local session logs; per-repo project memory pushed on demand | 1 state and resume, 4 the rest |
| Commercial | Pro USD 19/month or 190/year for one person; no free trial; 14-day refund; Firebase sign-in; Paddle payments; online license check with a 15-minute offline grace | not cloned |

Platform facts that shape the clone (https://www.symvibe.com/download, https://www.symvibe.com/tour, https://www.symvibe.com/privacy):

- macOS 14+ on Apple Silicon only. The one public criticism on Product Hunt was "Mac only"; the maker said that is intentional because the app is fully native.
- Direct DMG with signed in-app updates, not the Mac App Store, because the sandbox blocks spawning real processes.
- Code, audio and board state stay local. Only sign-in, planner commands with a board snapshot, and reply text reach its servers.

Prior art: the field is crowded, and almost every rival follows the Conductor pattern of one git worktree per agent plus diff review. Symvibe alone sells the board, voice and studios. None of the board-style apps is both cross-platform and worktree-native, and none is free, model-agnostic and invoked from inside the CLI; that is the clone's wedge. Plannotator (npm: open-plan-annotator) is the model for the invocation style: a free package that installs as a Claude Code plugin or an OpenCode plugin, starts a local server and opens a browser UI.

| Product | Shape | Platforms | License and price |
| --- | --- | --- | --- |
| Conductor (https://conductor.build/) | Mac app, worktree per workspace, Claude Code and Codex; the most-cited Mac option | macOS | Closed source, free for now |
| Superset (https://superset.sh/) | Any agent in worktrees, diff review, PRs, remote hosts, CLI and MCP; about 15.5k GitHub stars | macOS, iOS; Linux experimental | Elastic License 2.0, source-available |
| Orca | One prompt to several agents in worktrees, best-of-N, GitHub and Linear tasks | macOS, Windows, Linux | MIT, free |
| Emdash | Tickets from Linear, GitHub or Jira become worktree tasks; lifecycle hooks | macOS, Windows, Linux | Apache-2.0 |
| Nimbalyst (https://nimbalyst.com/, ex-Crystal) | Visual workspace with kanban, editors, diff review | macOS, Windows, Linux, iOS | MIT desktop app, free for individuals |
| Claude Squad | tmux session and worktree per agent, terminal UI | Terminal | AGPL, free |
| Warp | Agent-aware terminal tabs and notifications, no worktrees | macOS, Windows, Linux | AGPL client; Free, Build USD 18/month |
| Claude Desktop, Code tab | First-party parallel worktree sessions with line-level diff review | macOS, Windows | Included with a Claude plan |

Table sources: https://superset.sh/compare, https://developertoolkit.ai/en/ecosystem/agent-tools/agent-shells/ (updated 12 Oct 2026), https://nimbalyst.com/blog/best-multi-agent-desktop-apps-claude-code-codex-2026/ (vendor-written, 15 Apr 2026).

## Vision and goals

AgentBoard (working name, yours to change) is a free local tool that puts every coding agent you run on one zoomable board in your browser, each in its own git worktree, with status you can read at a glance. A small daemon owns the terminals; any agent CLI can open the board or spawn a console through a command, an MCP tool or a plugin, the way Plannotator plugs into Claude Code and OpenCode. It keeps Symvibe's board-first model, adds the worktree isolation every rival ships, runs on macOS, Windows and Linux, and needs no account and no model subscription: OpenCode with an API key or a local model is a first-class path. Decided with you on 23 October 2026: free and CLI-invoked, not a paid desktop app.

Goals, in priority order:

1. Dogfood by week 4: you do your daily agent work on the board instead of terminal tabs, and do not go back.
2. One command installs it and one command opens it: agentboard or brew install, then the board is in the browser within 5 seconds.
3. Six live consoles on a 16 GB laptop with no visible lag: keystroke echo under 50 ms and total memory under 1 GB, since there is no Electron.
4. A console that needs permission or input shows "needs you" within 2 seconds for Claude Code, Codex, Gemini CLI and OpenCode.
5. Nothing leaves the machine, ever: no sign-in, no servers, no telemetry, and the daemon listens only on 127.0.0.1.
6. Feature parity with Symvibe's board, orchestration and continuity by the end of phase 4; voice and studios after.

Non-goals for the MVP: reselling model access or taking API keys; running agents in the cloud; a hosted service or accounts of any kind; multi-user collaboration; a code editor (open the worktree in VS Code or Zed instead); mobile apps; a native desktop shell, which is an optional wrapper in phase 7.

Anti-goals, a failure even if it works:

- Slower or flakier than a plain terminal: input lag, lost scrollback, broken Ctrl-C or Vim.
- Agents acting without you: auto-approve flags stay off by default, and loops never answer permission prompts.
- Anything that reads as a copy of Symvibe: its name, logo, copy, screenshots or video. The features are fair game; the brand is not.
- A local server any web page could reach: the daemon is bound to 127.0.0.1 and every request carries a token.

## Who it is for

The first user is you: a solo developer running 2 to 8 agent sessions a day across a few repos, on whatever mix of plans, API keys and local models you have. Everything in the MVP serves that person; team features wait until one person loves it.

| Job to be done | Pain today | What the board does |
| --- | --- | --- |
| Keep several agents busy at once | Tabs hide which one is waiting, so you poll | Status badge per console, mission map, a notification on "needs you" |
| Try two approaches to one task | Agents collide editing the same files | One worktree and branch per console, diff and merge from the board |
| Run agents without a subscription | The board-style tools assume a Claude or ChatGPT plan | Runs OpenCode on an API key, OpenRouter or a local model; the board never cares which |
| Let the agent set up its own helpers | You open terminals and worktrees by hand | The agent calls spawn_console from inside its session and a new node appears |
| Pick up tomorrow where you stopped | Sessions get lost or hunted by ID | Board and session ids persist; consoles relaunch in place and resume |
| Keep notes and the preview beside the work | Browser, notes and terminals live in three apps | Web tiles, sticky notes and kanban next to the consoles |
| Hand a task from one agent to another | Copy-paste context by hand | A handoff brief generated from the outgoing session |
| Know what the fleet is costing | No view across sessions | Token and session analytics read from local logs |

Secondary users, later: developers on Windows or Linux locked out of the Mac-only tools, people who run local or API-key models rather than subscriptions, and team leads who review what agents produced. All three are reasons to stay cross-platform, model-agnostic and good at diffs from the start.

## Requirements

The MVP is F1 to F4: a board of real terminals with status and worktrees, persisted per repo, plus the integration layer that lets any CLI invoke it. Each story below is done when its acceptance criteria pass by hand on macOS and in an automated test where one is practical.

| ID | Story | Done when | Phase |
| --- | --- | --- | --- |
| F1.1 | Open a repo folder as a board | Pick a recent repo or type a path; `agentboard open .` from a terminal does the same; each repo gets its own saved board | 1 |
| F1.2 | Spawn a console from a catalog | Catalog lists every supported CLI found on PATH with its version (claude, codex, gemini, opencode, plus a custom command); the console starts in the repo or its worktree with the login shell's environment | 1 |
| F1.3 | A real terminal in each console | Ctrl-C, arrows, Vim, htop, resize, truecolor, copy and paste all work over the WebSocket; 10,000 lines of scrollback; font size setting | 1 |
| F1.4 | Pan, zoom and arrange | Trackpad pan; pinch or modifier-wheel zoom from 25% to 200%; drag and resize nodes; minimap; fit-to-view; a focused console captures keys and scroll | 1 |
| F1.5 | Workspaces per repo | Tabs, each with its own nodes and viewport; create, rename, delete; last workspace reopens | 1 |
| F1.6 | Persist and resume | Board state saved within 1 second of a change; the daemon outlives the tab, so reopening the URL shows the live consoles; after a daemon restart every console reappears in place as stopped with a Resume button that runs the CLI's native resume, or Start fresh | 1 |
| F2.1 | Status per console | One of starting, working, idle, needs you, exited; Claude Code and Gemini via hooks, OpenCode via its plugin events, Codex via its notify hook plus output matching, custom CLIs via a regex and a quiet timer | 1 |
| F2.2 | Hooks without touching user settings | Claude Code is launched with per-session hooks that post to the daemon; the user's own settings are never edited; OpenCode, Codex and Gemini get an opt-in one-time setup with a visible diff | 1 |
| F2.3 | Notifications | A web notification and a badge in the tab title when a console turns "needs you" while the tab is hidden; clicking it focuses that console | 1 |
| F3.1 | A worktree per console | "New worktree from <branch>" creates one under the repo's worktrees folder and shows its branch on the node; closing the node offers to remove the worktree and warns on dirty or unpushed work | 2 |
| F3.2 | Git card per node | Branch, ahead and behind counts, dirty file count, last commit; buttons for diff (file list plus unified diff in the app), commit, push, open PR through the gh CLI | 2 |
| F3.3 | Open elsewhere | One click opens the worktree in VS Code, Zed or Finder | 2 |
| F4.1 | A command any agent can run | `agentboard open`, `spawn <agent> [--worktree name] [--prompt text]`, `note <text>` and `status`; each starts the daemon if it is not running and prints JSON | 2 |
| F4.2 | An MCP server | `agentboard mcp` exposes open_board, spawn_console, list_consoles, add_note and get_status over stdio; registered with one line in Claude Code, Codex, Gemini CLI and OpenCode | 2 |
| F4.3 | A Claude Code plugin | Installable from a marketplace; a /board command and the status hooks, so a plain claude session gets a node and a status without the board launching it | 2 |
| F4.4 | An OpenCode plugin | One file in the OpenCode plugins folder; subscribes to session.status, session.idle and permission.asked and posts them to the daemon; exposes a board tool to the agent | 2 |

Later phases, specified in their own plan when the phase starts:

- Phase 3, board extras: web tile with a localhost URL and devtools, sticky note, markdown text node, checklist, image drop, ink layer, layout presets.
- Phase 4, orchestration and continuity: mission map, teams with roles, handoff briefs, loops on a schedule, on idle or on output with a stop goal, a composer that launches up to 12 consoles, multiple account profiles, token analytics from local session logs, per-repo project memory.
- Phase 5, command bar and voice: a natural-language command bar that moves the board, then push-to-talk on top of it with on-device transcription.
- Phase 6, studios: document, diagram, code tree and markdown vault.
- Phase 7, distribution: npm and brew releases with prebuilt node-pty binaries, a curl installer, and an optional desktop wrapper (Electron or Tauri) for a dock badge and native notifications.

Non-functional requirements, all phases:

- Safety: no auto-approve flags by default; the daemon binds to 127.0.0.1 on a random port; every HTTP and WebSocket request carries a per-launch token, the Host and Origin headers are checked and CORS is off, so no web page can reach it; nothing in a loop or a handoff answers a permission prompt.
- Durability: state is written atomically with a schema version and a migration path, so a crash never corrupts a board.
- Accessibility basics: full keyboard navigation between consoles, visible focus, contrast that passes WCAG AA.
- Performance: the budgets in the goals, checked in CI with a six-console smoke test.

## Stack and architecture

Decision, confirmed with you: a Node daemon and a browser UI, TypeScript end to end, on the terminal stack VS Code ships. The daemon is the `agentboard` command: it owns the PTYs, git, state and the integration endpoints, and serves the board at a localhost URL. That gives one language, one process to install, cross-platform builds for free, and no Electron to sign or notarize. The price is a browser tab instead of a native window; an optional desktop wrapper in phase 7 can add a dock badge later.

| Layer | Choice | Why | If it fails |
| --- | --- | --- | --- |
| Daemon | Node 22, the `agentboard` CLI, plain http plus the ws package | Owns PTYs, files, git, hooks and MCP; nothing to sign | Bun if startup time matters |
| Terminal | @xterm/xterm with the WebGL and fit addons, bytes over a WebSocket | What VS Code ships; fast, correct VT handling | DOM renderer while zoomed |
| PTY | node-pty with prebuilt binaries | What VS Code ships; macOS, Windows, Linux | |
| Board | @xyflow/react (React Flow 12) | Pan, zoom, drag, resize and minimap built in; a node is any React component | Hand-rolled canvas if 12 terminals stutter |
| UI | React 19, Vite, Tailwind 4, shadcn/ui, served as static files by the daemon | Fast to build; accessible primitives | |
| State | Zustand in the browser; JSON files written by the daemon | The simplest thing that persists; Symvibe does the same | SQLite through better-sqlite3 once analytics need queries |
| Git | simple-git over the user's git binary; gh for pull requests | No native bindings; the user's config and credentials just work | |
| Integration | @modelcontextprotocol/sdk for the MCP server; a Claude Code plugin folder; an OpenCode plugin file | Every major CLI speaks MCP; plugins add slash commands and events | The shell command alone, which any agent can run |
| Tests | Vitest for units; Playwright against the real daemon in a browser | | |
| Packaging | npm publish, a brew formula, a curl installer; optional Electron or Tauri wrapper later | | |

Process model: the daemon owns everything with a side effect (PTYs, files, git, the hook endpoint and the MCP server). The browser tab only draws and forwards input over a token-gated WebSocket.

- Browser tab (React): Console node (xterm.js over a socket), Mission map, Board (React Flow), Git card and notes.
- Daemon (Node, 127.0.0.1): PTY manager (node-pty), Local API (hooks, CLI and MCP calls), State store (atomic JSON, debounced), Git service (worktrees, status, gh), Agent catalog (PATH scan).
- On this machine: the agent CLIs (any CLI on PATH), the CLI and MCP bridge (`agentboard spawn`, `agentboard mcp`), ~/.agentboard/*.json, git and gh.
- Edges: Console node <-> PTY manager (socket); Local API -> Mission map (status); Board -> State store (save); Git card <-> Git service; PTY manager -> Agent CLIs (spawn); Agent CLIs -> Local API (hooks); CLI and MCP bridge -> Local API (calls); State store -> board files; Git service -> git and gh.

Calls a builder would otherwise have to guess:

- Hook injection for Claude Code: each console launches with per-session hooks for Stop, Notification, UserPromptSubmit, PermissionRequest and SessionEnd that post to the daemon with the console id, through inline settings (the --settings flag) or, if those replace the user's own hooks instead of merging, through a one-file plugin passed with --plugin-dir. The launch also passes --session-id so the daemon knows what to resume, and --name for the node title.
- OpenCode: the console launches opencode with AGENTBOARD_URL and AGENTBOARD_CONSOLE_ID in its environment; a one-file plugin in the OpenCode plugins folder, installed after the user sees it, reads them and posts session.status, session.idle and permission.asked to the daemon. Fallback: poll the session status endpoint of `opencode serve`.
- Codex and Gemini: a notify entry and a hooks entry, opt-in after the user sees the diff; output matching is the fallback for every CLI.
- Invocation: the agentboard subcommands and the MCP tools read the daemon's port and token from ~/.agentboard/daemon.json, start a daemon if none answers, and open the browser with the token URL; a second open focuses the existing tab. When the caller runs inside a console, its console id travels with the call so the new node lands beside it.
- Environment: the daemon reads the login shell's environment once at startup, so PATH, version managers and credentials match what the terminal sees.
- Zoom: terminals use the WebGL renderer and refit on zoom end; consoles outside the viewport stop rendering; the focused console carries React Flow's nodrag and nowheel classes so it owns keys and scroll.
- Worktrees: the daemon runs git worktree add into <repo>/.worktrees/<name> on a new branch from the chosen base, and excludes that folder in .git/info/exclude. The daemon owns worktrees rather than Claude Code's own -w flag, so every agent behaves the same.
- Resume: claude --resume <id>, codex resume <id> with the id read from Codex's session files at spawn, opencode with its session flag, and Gemini's resume command, each verified in the spike.
- Browser security: the browser gets the token from the URL once and keeps it in a cookie; the WebSocket upgrade checks Origin; the Host header must be localhost; no CORS headers at all; a test proves a request from a foreign origin is refused.

## Data model and key flows

All state is one JSON file per repo at ~/.agentboard/boards/<repo-hash>.json plus ~/.agentboard/settings.json, versioned from day one so a later schema can migrate it. The running daemon writes ~/.agentboard/daemon.json.

```typescript
type AgentId = 'claude' | 'codex' | 'gemini' | 'opencode' | 'custom'
type Daemon = { port: number; token: string; pid: number }   // ~/.agentboard/daemon.json
type Board = { version: 1; repoPath: string; activeWorkspaceId: string; workspaces: Workspace[] }
type Workspace = { id: string; name: string; viewport: { x: number; y: number; zoom: number }; nodes: BoardNode[] }
type BoardNode = ConsoleNode | NoteNode | WebTileNode | ChecklistNode
type ConsoleNode = {
  id: string; type: 'console'; title: string; x: number; y: number; w: number; h: number
  agent: AgentId; cwd: string
  worktree?: { path: string; branch: string; base: string }
  session?: { provider: AgentId; id: string }   // what resume needs
  status: 'stopped' | 'starting' | 'working' | 'idle' | 'needs_you' | 'exited'
  createdAt: string; lastActiveAt: string
}
type AgentDef = { id: AgentId; command: string; args: string[]; resume: (sessionId: string) => string[]; signal: 'hooks' | 'plugin' | 'notify' | 'heuristic' }
```

How each CLI's signals map to a status:

| CLI | Working | Idle | Needs you | Exited |
| --- | --- | --- | --- | --- |
| Claude Code | UserPromptSubmit, PreToolUse | Stop | Notification with permission_prompt, idle_prompt, agent_needs_input or elicitation_dialog; PermissionRequest | SessionEnd or PTY exit |
| OpenCode | session.status busy, tool.execute.before | session.idle | permission.asked | PTY exit |
| Codex | Output after a prompt is sent | notify agent-turn-complete | Approval prompt matched in output | PTY exit |
| Gemini CLI | BeforeAgent hook | AfterAgent hook | Notification hook | PTY exit |
| Custom | Output activity | Quiet for 20 seconds | User-supplied regex | PTY exit |

Spawn a console:

1. The user picks an agent and, optionally, "new worktree from main".
2. The daemon creates the worktree, then spawns node-pty with the login-shell environment, the working directory, and the agent command with its hook flags and a fresh session id.
3. The browser attaches xterm.js to the PTY stream over the WebSocket; the node shows starting until the first hook event or output.

A status event:

1. The CLI posts the hook JSON to /hook/<consoleId> with the launch token.
2. The daemon checks the token, maps the event with the table above, and stores the status on the node.
3. The browser updates the badge and mission map; if the status is needs you and the tab is hidden, the browser shows a web notification and badges the tab title.

Relaunch the daemon:

1. Load the board file; every console renders in place as stopped.
2. Resume spawns the agent with its resume arguments in the same directory; Start fresh spawns a new session.

Close a console:

1. Send SIGHUP, then SIGKILL after 5 seconds.
2. If the console owns a worktree, check for dirty or unpushed work, then offer remove, keep, or open the diff.

Invoke from a CLI:

1. An agent calls the spawn_console MCP tool, or runs `agentboard spawn opencode --worktree feat-x`.
2. The command reads ~/.agentboard/daemon.json; if no daemon answers, it starts one and opens the browser with the token URL.
3. The daemon creates the worktree, spawns the console, places the node beside the caller's node when the call carries a console id, and returns the new id as JSON.

## Execution plan

Eight phases, each ending at a gate you judge by using the app, not by ticking a list. The MVP is phases 0 to 2, about 5 to 7 weeks; full Symvibe parity is 15 to 23 weeks. Estimates assume one person building full time with Claude Code; halve the pace for evenings.

| Phase | Scope | Duration | Gate |
| --- | --- | --- | --- |
| 0 spike | Daemon and browser board, six terminals, hook events arriving | 3 to 5 days | Hooks arrive, daemon shape confirmed |
| 1 MVP board | Consoles, workspaces, status, persist and resume | 2 to 3 weeks | Five days of dogfood, no tabs |
| 2 worktrees, git, integration | Worktree per console, git card, CLI, MCP server, plugins | 2 to 3 weeks | A CLI-spawned console; both merged from the board |
| 3 board extras | Web tiles, notes, checklists, image drop, ink, presets | 1 to 2 weeks | Preview and notes used daily |
| 4 orchestration | Mission map, teams, handoffs, loops, composer, analytics | 3 to 4 weeks | A real handoff and loop shipped |
| 5 command bar and voice | Natural-language board commands, then push-to-talk | 2 to 3 weeks | A spoken command moves the board |
| 6 studios | Document, diagram, code tree, markdown vault | 3 to 4 weeks | Symvibe parity |
| 7 distribution | npm and brew release, installer, optional desktop wrapper | 1 week | npx install works on a clean machine |

Phase 0, spike and setup, 3 to 5 days:

- [ ] git init; a TypeScript workspace with two packages, daemon and ui; Vite for the UI, Vitest, ESLint; a CLAUDE.md with conventions; CI on macOS, Ubuntu and Windows runners
- [ ] The daemon serves the UI and bridges node-pty to xterm.js over a WebSocket; one React Flow node holds a terminal; confirm Ctrl-C, Vim, resize
- [ ] Six consoles at zoom 25% to 200%; measure keystroke latency and memory against the budget
- [ ] Launch claude with per-session hooks posting to the daemon; confirm Stop and Notification arrive with the console id
- [ ] A throwaway OpenCode plugin that posts session.idle and permission.asked to the daemon; confirm it fires with a local model
- [ ] Check Codex's per-launch config override for notify and Gemini's hooks; record what works in this doc
- [ ] Confirm injected hooks merge with the user's own hooks (plugins such as superpowers register hooks too); if they replace them, switch to the --plugin-dir route
- [ ] Capture each Codex, Gemini and OpenCode session id at spawn so resume targets the right session when consoles share a directory
- [ ] Gate: the throwaway build runs six consoles, Claude Code and OpenCode mixed, with live status in a browser tab; the daemon shape is confirmed

Phase 1, MVP board, 2 to 3 weeks:

- [ ] F1.1 repo picker, `agentboard open`, and a board file per repo
- [ ] F1.2 agent catalog from PATH, plus a custom command
- [ ] F1.3 terminal polish: scrollback, copy and paste, font size, truecolor
- [ ] F1.4 pan, zoom, drag, resize, minimap, fit, focus handling
- [ ] F1.5 workspaces
- [ ] F1.6 atomic save; the daemon outlives the tab; restart as stopped; resume per CLI
- [ ] F2.1 status mapping; F2.2 hook and plugin setup; F2.3 web notifications and tab badge
- [ ] Token, Host and Origin checks on every request, with a test that a foreign origin is refused
- [ ] Gate: five working days of dogfood with no return to terminal tabs, budgets met

Phase 2, worktrees, git and the integration layer, 2 to 3 weeks:

- [ ] F3.1 worktree per console with the branch on the node and safe removal
- [ ] F3.2 git card and diff view; commit, push, pull request through gh
- [ ] F3.3 open the worktree in VS Code, Zed or Finder
- [ ] F4.1 the `agentboard` subcommands with JSON output and daemon auto-start
- [ ] F4.2 the MCP server and a one-line registration for each CLI
- [ ] F4.3 the Claude Code plugin with the /board command and hooks
- [ ] F4.4 the OpenCode plugin with status events and a board tool
- [ ] Gate: from inside an OpenCode session the agent spawns a second console in a worktree, both work the same repo, and you merge both from the board

Phases 3 to 7 are planned when the previous gate passes, each with its own brainstorm and implementation plan:

- Phase 3, board extras, 1 to 2 weeks: web tiles, notes, checklists, image drop, ink, presets. Gate: preview and notes used daily.
- Phase 4, orchestration and continuity, 3 to 4 weeks: mission map, teams, handoffs, loops, composer, profiles, analytics, project memory. Gate: a real handoff and a real loop shipped work; analytics match the CLI's own usage numbers within 5%.
- Phase 5, command bar and voice, 2 to 3 weeks: text commands first, push-to-talk second. Gate: a spoken command moves the board hands-free.
- Phase 6, studios, 3 to 4 weeks: document, diagram, code tree, markdown vault. Gate: Symvibe parity.
- Phase 7, distribution, 1 week: npm and brew releases with prebuilt node-pty, a curl installer, release notes; an optional desktop wrapper only if the tab-badge limit bites. Gate: `agentboard` (linked from the checkout; the unscoped npm name is taken, D33) works on a clean Mac, Linux and Windows machine.

How to run it with Claude Code:

1. Start each phase with a short brainstorm, then the writing-plans skill for a task-by-task plan, then subagent-driven development with tests first.
2. From phase 2 on, run each task in its own worktree inside AgentBoard itself; the app is its own best test.
3. This document is the source of truth. When a decision changes, update it before the code.

## Risks, legal and costs

The three risks that can sink the project are tested in the phase 0 spike or guarded by a test from day one: terminals under CSS zoom, hook injection, and a local server that a web page could reach.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| xterm.js blurs or stutters when React Flow scales it | Board unusable past a few consoles | Spike first; WebGL renderer, refit on zoom end, pause off-screen consoles; fall back to a hand-rolled canvas |
| A web page reaches the local daemon through DNS rebinding or CSRF and spawns a shell | Remote code execution on your machine | Bind 127.0.0.1; a per-launch token on every request; Host and Origin checks; no CORS; a test that a foreign origin is refused |
| A Claude Code update changes hooks or the --settings flag | Status goes blind | Output matching and a quiet timer as fallback; an integration test pinned to the installed CLI version |
| OpenCode's plugin API or event names change between releases | Status for OpenCode goes blind | Pin the plugin to the OpenCode version it was tested with; the session status endpoint as fallback |
| Codex or Gemini cannot take hooks per launch | Global config must be edited | Opt-in with a visible diff; the heuristic fallback |
| Provider terms: Claude plans may not be used through OpenCode, and loops or voice driving any subscription CLI may count as automation | Account risk for users | Document the supported paths; keep a human in the loop; never auto-answer permissions |
| node-pty prebuilt binaries missing for a platform or Node version | npx install fails on a clean machine | Ship prebuilds for macOS arm64 and x64, Linux x64 and arm64, Windows x64; CI installs on all three OSes |
| Scope creep: Symvibe has about 40 features | Nothing ships | Phase gates; dogfood decides the next phase |

Legal and intellectual property:

- Features and ideas are not protected; names, logos, copy, screenshots and video are. Use your own name and brand and write every word yourself.
- Claude, Codex, Gemini and OpenCode are third-party marks. "Works with OpenCode" is fine; a product name containing them is not.
- Ship under MIT. xterm.js, node-pty, React Flow and the MCP SDK are MIT or Apache-2.0 and mix cleanly; avoid AGPL code such as Warp's client or Claude Squad unless the whole project goes AGPL.
- Users run their own CLIs under their own accounts or keys, and the daemon never proxies model traffic.

Running costs:

| Item | Cost | When |
| --- | --- | --- |
| npm, a brew tap and GitHub Actions on a public repo | Free | Phase 7 |
| Domain and a static docs site | About USD 15 per year | Phase 7 |
| Apple Developer Program, only if you ship the optional desktop wrapper | USD 99 per year | After phase 7, optional |
| Voice planner model calls | Per use, on the user's own key | Phase 5 |
| Model usage while building and testing | Whatever your OpenCode or Claude setup costs; a local model is free | All phases |
| Your time | 15 to 23 weeks full time | All phases |

## Assumptions and open questions

I made these calls without you; each one is cheap to reverse now and expensive after phase 1.

- [ ] Decided with you on 23 October 2026: a free local daemon with a browser board, invoked from any CLI, instead of a paid desktop app.
- [ ] MIT license and a public repo, my call; change it if you want to keep the source private.
- [ ] Cross-platform from day one, with macOS as the only platform you test by hand until phase 7; CI covers Linux and Windows.
- [ ] A worktree per console is in the MVP even though Symvibe lacks it, because it is the feature its own users asked for.
- [ ] The integration layer (command, MCP server, two plugins) is in the MVP, because being invoked from the CLI is the point.
- [ ] Voice and studios come last; they are Symvibe's showpieces but not what you use ten times a day.
- [ ] Working name AgentBoard; the real name is yours to pick before phase 7.
- [ ] The app reserves only Cmd+Shift chords and Cmd+1 to 9 for workspaces; every other key goes to the focused terminal.
- [ ] Scrollback is not persisted across a daemon restart in the MVP; resume brings back the CLI's own conversation, not the screen.

Only you can answer these, and each answer changes what gets built:

- [ ] Which agents and models do you run today: OpenCode with which provider, Claude Code on a plan or an API key, anything else? The MVP tests exactly those.
- [ ] Public repo from the first commit, or private until the MVP gate?
- [ ] Windows or Linux users in your circle, or Mac only? It only changes how early CI on those runners has to be green.
- [ ] How much time per week? The estimates assume full time.
