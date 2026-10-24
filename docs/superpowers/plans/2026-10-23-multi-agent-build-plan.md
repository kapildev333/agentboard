# AgentBoard Multi-Agent Build Plan

> **For agentic workers:** the governor (`/govern`) dispatches one background Claude Code session per lane from the task cards below; each worker follows its brief (`.claude/briefs/<lane>.md`) with test-first steps. Steps use checkbox (`- [ ]`) syntax for tracking on the GitHub issue board.

**Goal:** Build the AgentBoard MVP (PRD phases 0 to 2) with one Fable governor and a queue of parallel worker sessions, merging through a local gate and an independent review, with commits only in the owner's name and nothing secret ever leaving the machine.

**Architecture:** One interactive Fable session runs `/loop 15m /govern`. Each tick it reads a GitHub-issue board, checks every background worker, gates and reviews finished pull requests in parallel, merges what passes, and dispatches the next unblocked lanes up to PARALLEL (6). Workers are `claude --bg` sessions in their own worktrees, watched with `claude agents`, `claude attach` and `claude logs`.

**Tech Stack:** Claude Code 2.1.309 background sessions and cross-session messaging; GitHub issues and pull requests through `gh`; `scripts/gate.sh` (npm ci, lint, typecheck, Vitest, build, gitleaks, npm audit) in place of CI; Node 22, TypeScript strict, npm workspaces, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-agentboard-design.md` (approved 2026-10-23). Shareable copy of this plan with diagrams: https://claude.ai/artifact/LfCofqbHgc877wgAP6CPMc

## Global Constraints

- Node 22 or later; TypeScript strict; npm workspaces under `packages/` (shared, daemon, ui, cli, mcp, plugins, e2e); exact dependency versions; `npm ci` only; `ignore-scripts=true`.
- Daemon binds 127.0.0.1 on a random port; every HTTP and WebSocket request carries a per-launch token; Host and Origin are checked; no CORS headers.
- Budgets from the spec: six live consoles, keystroke echo under 50 ms p95, total memory under 1 GB, "needs you" within 2 seconds.
- Commits authored as `kapildev333 <47056817+kapildev333@users.noreply.github.com>`; no Co-Authored-By or "Generated with" lines; no session links.
- Private repo `kapildev333/agentboard` until the owner opens it; MIT assumed for that day.
- No secrets, tokens, keys, hostnames or personal data in files, commits, PR bodies, issues or logs; `.env*` gitignored and denied for Read.
- Workers edit only inside their worktree and their lane's scope paths; only the governor merges; nobody pushes to main; no force pushes.
- Nothing asks the owner from inside a lane; open choices are decided and recorded under Decisions.

## Review Focus

1. A request to the daemon from a web page (foreign Origin or non-localhost Host) must be refused: L12's tests pin it; L1A's e2e repeats it end to end.
2. A console whose CLI never posts a hook (custom CLI, hook injection broken by a CLI update) must still turn idle and needs you from output heuristics: L13's quiet-timer and regex tests.
3. A daemon restart with consoles open must render every console as stopped with a working Resume, never a blank board: L10's interrupted-write test and L1A's reload scenario.
4. A worktree close with uncommitted or unpushed work must refuse unless forced: L20's tests.
5. Two consoles in the same directory must resume the right sessions: L04 to L06 capture session ids at spawn; L14's resumeArgs tests use them.

---

## How the build runs

One Fable session governs; everything else is a worker it dispatches, watches and merges. The governor runs in a loop. Workers are background Claude Code sessions, one per lane, each in its own git worktree and branch, which you can watch in any terminal window with `claude attach`, and from phase 1 on as consoles in AgentBoard itself.

- Governor: `claude --name governor --model claude-fable-5-1` in the repo root, then `/loop 15m /govern`. Each tick it reads the board (GitHub issues, one per lane), checks every worker with `claude agents --json --all`, reads their logs, runs the gate and an independent review on finished lanes, merges what passes, sends feedback on what fails, and dispatches the next unblocked lanes up to the parallel limit.
- Workers: `claude --bg --name <lane> -w <lane> --model claude-sonnet-5-5` with the lane brief as the prompt. A worker owns a disjoint set of paths, builds test-first, runs the gate, pushes, opens a pull request, posts its report on the issue, and goes idle. It never merges and never touches main.
- Reviewers: Opus subagents the governor spawns per pull request, in parallel, reading only the diff and the lane card. Verdict: approve, or changes with findings. The governor never merges on the worker's word.
- Watching: `claude agents` opens the live view; `claude attach <lane>` puts any worker in your terminal window; `claude logs <lane>` prints its recent output.
- Parallelism: the governor keeps 8 lanes running on the 16 GB M2 Pro and lowers that only when memory or the plan's rate limit runs short. Dispatch follows the dependency graph, not the phase: a lane starts when its inputs are merged, or stacked on an unmerged predecessor's branch when their scopes are disjoint. Gates hold only the lanes that need the gate's answer.

Flow of one tick: lane board (GitHub issues) → dispatch up to 6 workers → worker builds in its worktree → pull request with gate tail and report → gate (scripts/merge.sh) and Opus review → squash merge, label merged, `claude rm` → back to the board; findings from a failed review go straight back into the same worker session.

## Why the agents capped at 2 to 4

There is no hard cap at 2 to 4 in any config. The ceiling came from the shape of the ShopperStop and UniCourse orchestrations and from Claude's defaults:

| Cause | Where it showed | What this plan does instead |
| --- | --- | --- |
| Pipelines, not a queue: each area manager ran one lane as team lead, then workers, then reviewer, then its own verification, keeping 1 to 3 agents alive; more parallelism meant opening another terminal by hand | ShopperStop manage.md and lane logs; UniCourse orchestrate.md | One governor and a queue: N background workers at once (6 to start), refilled the moment one merges |
| Sub-agents had about 100k tokens, so big tasks became sequential a, b, c sub-lanes and every fix round a fresh worker | UniCourse practicalities note, 2026-10-06 | Every worker is a full session with its own context; one lane is one worker from brief to pull request |
| Claude's defaults nudge small: workflow size guideline (medium, under 10; small on Pro, under 5), agent-teams advice of 3 to 5, the model's habit of 2 to 4 | 173 transcript lines carry the "keep workflows under 10 agents" guideline | `.claude/settings.json` sets workflowSizeGuideline large and CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS 40; `/govern` names the number to keep running |
| Sub-agents could not spawn sub-agents then, so managers had to be sessions started by hand | ShopperStop lane-roles note, 2026-10-12 | 2.1.309 allows 3 layers and 20 concurrent sub-agents per session; the governor dispatches background sessions with one command |
| Shared resources serialized lanes: one test database, one e2e port, one node_modules symlinked across worktrees | UniCourse notes on port races and symlinks | No database; each worktree runs its own npm ci; Playwright starts the daemon on a random port per run |
| Rate limits: parallel sessions drain one plan's window | The overnight-run rules | Workers on Sonnet, reviewers on Opus, one Fable; the governor lowers PARALLEL before the window empties and never touches billing |

Remaining hard limits in 2.1.309: 20 concurrent sub-agents per session unless raised, 3 nesting layers, no documented cap on background sessions, and memory (each session a few hundred MB; 6 to 8 on 16 GB).

## Security rules

Secrets and identity:

- The product needs no API key; its only tokens are per-launch localhost tokens in `~/.agentboard/daemon.json` (mode 600), never in the repo.
- The GitHub token stays in the keychain under gh; the guard refuses `gh auth token`, `security`, `printenv` and bare `env`.
- Every session is denied Read on `~/.claude.json`, `~/.claude/.credentials.json`, `~/.ssh/**`, `~/.config/gh/**`, `~/.npmrc`, `./.env*`.
- The gate runs gitleaks over the commit range before any merge; a hit fails the gate and the branch is rewritten before it lands.
- Commits carry the noreply identity from the repo git config; attribution is off in `.claude/settings.json`.

What a worker may do: edit only inside its worktree and lane scope (guard refuses `.claude/`, `scripts/`, `.github/`, `.env*`, `CLAUDE.md`); run npm scripts, git on its branch, `gh pr create`, `gh issue comment`; never merge, push to main, force-push, run curl, wget, ssh, scp, nc, sudo, docker, npm publish, or start another claude session; no WebFetch or WebSearch (the brief carries the docs); permission mode auto, fallback bypassPermissions with the same hooks (`AGENTBOARD_PERMISSION_MODE`).

Supply chain: exact versions, committed lockfile, `npm ci`, `ignore-scripts=true` (explicit `npm rebuild node-pty` if needed), `npm audit --audit-level=high` in the gate; a new dependency needs a one-line reason in the PR body.

The governor: acceptEdits with allow rules for npm, git, gh, claude and the scripts; same deny list and guard; never pastes tokens anywhere; stops only for destructive or outward-facing actions.

## Git and GitHub flow

- Private repo `kapildev333/agentboard`; nobody pushes to main; only the governor merges, through gh, after its own gate and an independent review.
- One branch and one PR per lane, created by Claude Code's `-w` worktree at `.claude/worktrees/<lane>` from origin/main. PR title `<ID>: <title>`, body from `.claude/pr-template.md`.
- The local gate replaces CI: `scripts/gate.sh`; workers run it before the PR; the governor reruns it on the PR head in a scratch worktree with `scripts/merge.sh`.
- Review: one Opus reviewer subagent per PR in parallel, prompt `.claude/review-prompt.md`; verdict APPROVE or CHANGES with file:line findings.
- Merge: `gh pr merge <n> --squash --delete-branch --match-head-commit <sha>`; conflicts go back to the worker with "rebase onto origin/main"; then `claude rm <session>`.
- Board: one issue per lane, one state label at a time (queued, running, review, changes, merged, blocked, needs-owner); PRs say `Closes #n`; a pinned Decisions issue holds the governor's calls as "owner to confirm".
- Commits in the owner's name only; the reviewer fails any PR whose commits carry another author or a trailer.
- Optional later: a self-hosted GitHub Actions runner on this Mac for free CI once the repo is public.

## Work breakdown for the MVP

26 lanes cover phases 0 to 2. Contracts land first (L01), then everything runs against them in parallel. With 6 workers, phase 0 is about a day, phases 1 and 2 two to three days each plus fix rounds, then five days of dogfood. Phase 3 (board extras, spec section "Later phases") adds L30 to L37 after v0.1.0: L30 lands the contracts and pushes them at once, L31 runs from main, L32 to L36 stack on L30's branch, L37 closes the phase with an e2e. Its gate is the spec's: the preview and the notes used daily, an owner check.

| Lane | Title | Owns (paths) | Starts after | Model |
| --- | --- | --- | --- | --- |
| L00 | Foundation: workspace, lint, test, build, gate wiring | root files, packages/*/package.json | nothing | Sonnet |
| L01 | Contracts: shared types, WebSocket protocol, HTTP routes, status map, fixtures | packages/shared | L00 | Opus |
| L02 | Spike: PTY to WebSocket bridge, six shells, latency numbers | packages/daemon/spike | L01 | Sonnet |
| L03 | Spike: xterm.js inside a React Flow node under zoom | packages/ui/spike | L01 | Sonnet |
| L04 | Spike: Claude Code hook injection, session ids, resume | packages/daemon/src/agents/claude | L01 | Opus |
| L05 | Spike: OpenCode plugin events with a local model | packages/plugins/opencode | L01 | Sonnet |
| L06 | Spike: Codex notify and Gemini hooks per launch | packages/daemon/src/agents/codex, packages/daemon/src/agents/gemini | L01 | Sonnet |
| L10 | State store and daemon file | packages/daemon/src/state | L01 | Sonnet |
| L11 | PTY manager | packages/daemon/src/pty | L01 | Sonnet |
| L12 | Server: http, WebSocket, token, Host and Origin checks, static files | packages/daemon/src/server | L01 | Opus |
| L13 | Status: hook endpoint, mapper, quiet timer | packages/daemon/src/status | L01 | Sonnet |
| L14 | Agent catalog, launch and resume arguments | packages/daemon/src/agents | L04, L05, L06 | Sonnet |
| L15 | Board canvas and workspaces | packages/ui/src/board | L01 | Sonnet |
| L16 | Console node | packages/ui/src/console | L01 | Sonnet |
| L17 | Status badges, mission map, notifications | packages/ui/src/status | L01 | Sonnet |
| L18 | Shell: repo picker, spawn dialog, settings | packages/ui/src/shell | L01 | Sonnet |
| L19 | CLI: start, open, status | packages/cli | L01 | Sonnet |
| L1A | Integration and e2e smoke | packages/daemon/src/app, packages/ui/src/app, packages/e2e | L10 to L19 | Opus |
| L20 | Git service: worktrees, status, diff, commit, push, PR | packages/daemon/src/git | L01 | Sonnet |
| L21 | Git card and diff view | packages/ui/src/git | L01 | Sonnet |
| L22 | Open in VS Code, Zed or Finder | packages/daemon/src/open, packages/ui/src/open | L20 | Haiku |
| L23 | CLI: spawn, note, status with JSON output | packages/cli | L19 | Sonnet |
| L24 | MCP server | packages/mcp | L01 | Sonnet |
| L25 | Claude Code plugin | packages/plugins/claude | L13 | Sonnet |
| L26 | OpenCode plugin, production | packages/plugins/opencode | L05, L13 | Sonnet |
| L27 | Integration e2e: a CLI-spawned console, two worktrees, merge | packages/e2e | L20 to L26 | Opus |
| L30 | Phase 3 contracts: text, image, ink, layouts, assets and preview routes | packages/shared | nothing | Sonnet |
| L31 | Web tile node: URL bar, reload, open in a tab, inspector panel | packages/ui/src/webtile, packages/ui/test/webtile*, one registration line in packages/ui/src/app.tsx | nothing | Sonnet |
| L32 | Localhost preview proxy with console capture | packages/daemon/src/preview, packages/daemon/test/preview*, route wiring lines in packages/daemon/src/app.ts | L30 | Opus |
| L33 | Sticky note, markdown text and checklist nodes, the Add menu | packages/ui/src/notes, packages/ui/test/notes*, registration lines in packages/ui/src/app.tsx | L30 | Sonnet |
| L34 | Image drop: asset store and image node | packages/daemon/src/assets, packages/daemon/test/assets*, packages/ui/src/image, packages/ui/test/image*, wiring lines in app.ts and app.tsx | L30 | Sonnet |
| L35 | Ink layer per workspace | packages/ui/src/ink, packages/ui/test/ink*, one line in packages/ui/src/app.tsx | L30 | Sonnet |
| L36 | Layout presets and saved layouts | packages/ui/src/layout, packages/ui/test/layout*, one line in packages/ui/src/app.tsx | L30 | Sonnet |
| L37 | Phase 3 e2e: preview, notes, image, ink and presets survive a reload | packages/e2e | L31 to L36 | Opus |

Dispatch follows the dependency graph, never the phase (D9): L00 first, since every lane needs the workspace; then L01 and the five spikes together, stacked on L00's branch before it merges; then every lane whose inputs are in, eight at a time (D8), so L10 to L19 and the phase 2 lanes L20, L21 and L24 compete for the same queue; L14 waits for the three agent spikes; L1A for L10 to L19; L27 for L20 to L26. Gate 0 (owner reads the spike reports, the governor shows six mixed consoles) holds L14 only; gate 1 (five days of dogfood) and gate 2 (from OpenCode the agent spawns a console; both worktrees merged) are owner checkpoints and hold nothing. A stacked lane rebases with `git rebase --onto origin/main <base-sha>` once its base lands.

## Task cards

Every lane follows the same loop: failing test, run it red, smallest code, run it green, commit `test:` then `feat:`, repeat per behaviour, gate, rebase if behind, push, pull request, report on the issue, stop.

| Lane | Produces | First failing test | Done when |
| --- | --- | --- | --- |
| L00 | npm workspaces over packages/*; tsconfig.base.json strict; ESLint flat config; Vitest workspace; scripts lint, typecheck, test, build; .npmrc with save-exact and ignore-scripts; node-pty confirmed to install with scripts off, else an explicit `npm rebuild node-pty` in scripts/gate.sh | packages/shared/test/smoke.test.ts asserting the workspace resolves @agentboard/shared | scripts/gate.sh passes on a fresh clone |
| L01 | packages/shared: types.ts (AgentId, ConsoleStatus, Board, Workspace, BoardNode, ConsoleNode, DaemonInfo); protocol.ts (client messages attach, input, resize; daemon messages output, status, exit, board); routes.ts (GET and PUT /api/board, POST and DELETE /api/consoles, POST /api/consoles/:id/resume, GET /api/agents, GET /api/status, POST /hook/:consoleId, GET and POST /api/git/*); zod schemas for all; status-map.ts with mapSignal(agent, event, payload) as a data table; fixtures/board.json | protocol.test.ts: parseClientMessage round-trips an input message and rejects an unknown t | Every message and route has a schema and a fixture; the status map covers the PRD table row by row |
| L02 | spike/pty-ws.ts bridging node-pty to one WebSocket per console; spike/latency.ts; docs/spikes/L02.md with numbers | pty.spike.test.ts spawning `sh -c "echo hi"` and reading hi back | Six shells over one socket, p95 echo under 50 ms, memory per shell noted |
| L03 | A Vite page with React Flow and six xterm.js WebGL nodes on L02's socket, zoom 25 to 200 percent; docs/spikes/L03.md with fps, blur and input findings and the renderer decision | A Playwright script that types into a node and reads the echo | The report answers whether WebGL under CSS scale is usable, with numbers |
| L04 | agents/claude.ts: claudeLaunch({consoleId, sessionId, daemonUrl, token, name, resume}) → {command, args} with --session-id, --name and hooks for Stop, Notification, UserPromptSubmit, PermissionRequest, SessionEnd posting to daemonUrl; packages/plugins/claude-hooks for the --plugin-dir route; docs/spikes/L04.md saying whether inline hooks merge with the user's own | claude.test.ts: args contain --session-id and the five hook events with the daemon URL | A real claude launched with those args posts Stop to a local listener; --resume brings the session back |
| L05 | plugins/opencode/agentboard.ts reading AGENTBOARD_URL and AGENTBOARD_CONSOLE_ID, posting session.status, session.idle, permission.asked; docs/spikes/L05.md with the session id source and resume flag | A unit test feeding a fake event and asserting the POST body | Real opencode on a local model fires all three events to a listener |
| L06 | agents/codex.ts and agents/gemini.ts with launch and resume args; docs/spikes/L06.md per CLI: per-launch hook yes or no, resume command, session id source | Tests on the argument builders | The report is complete for both CLIs |
| L10 | StateStore: load(repoPath), save(board) atomic by temp file and rename with a 300 ms debounce, migrate(raw) from version 0; DaemonFile read and write at ~/.agentboard/daemon.json mode 600; board path ~/.agentboard/boards/<sha1 of repoPath>.json | state.test.ts: save then load is equal; an interrupted write leaves the previous file intact | Tests pass; the daemon file is mode 600 |
| L11 | PtyManager: spawn({id, command, args, cwd, env, cols, rows}), write, resize, kill with SIGHUP then SIGKILL after 5 s, onData, onExit, a 200 KB ring buffer for late attach, loginEnv() read once from the login shell | pty.test.ts: spawn sh, write echo hi, receive hi; resize changes stty size | Tests pass on macOS; loginEnv contains PATH entries missing from process.env when launched from Finder |
| L12 | createServer({port: 0, token, staticDir, routes}) with http and ws; token from header or a one-time query parameter moved to a cookie; Host must be localhost or 127.0.0.1; Origin must equal the server's own origin on WebSocket upgrades and non-GET requests; no CORS headers | server.test.ts: no token → 401; foreign Origin → 403; foreign-origin WebSocket upgrade refused; valid request succeeds | Tests pass; daemon.json carries port and token through L10 |
| L13 | StatusTracker: handleHook(consoleId, agent, body) through the shared status map; markOutput(consoleId) with a 20 s quiet timer for heuristic agents; regex rules for custom agents; emits status events | status.test.ts: table-driven over the PRD rows plus the quiet timer with fake timers | Every row of the PRD table passes |
| L14 | AgentCatalog.scan() finding claude, codex, gemini, opencode on PATH with versions; launchArgs(agent, context) and resumeArgs(agent, sessionId) delegating to per-agent modules; custom agents from settings; GET /api/agents | catalog.test.ts: a fake PATH of stub scripts is found with versions | Tests pass; the spawn dialog lists what the machine has |
| L15 | Board on React Flow with nodes from the useBoard store, zoom bounds 0.25 to 2, minimap, fit, drag and resize, workspace tabs (create, rename, delete), viewport saved through PUT /api/board debounced | board.test.tsx: adding a node renders it; switching workspace swaps the nodes | Playwright: drag a node, reload, position kept |
| L16 | ConsoleNode with xterm.js WebGL and fit, useConsoleSocket, nodrag and nowheel while focused, resize observer sending cols and rows, copy and paste, font size from settings, a status badge slot | console.test.tsx: a keypress sends an input message; a resize sends cols and rows | Ctrl-C and Vim work in the e2e smoke |
| L17 | StatusBadge, MissionMap panel grouped by status, useNotifications showing a web notification and a title badge when the tab is hidden and a console turns needs you | status.test.tsx: needs you while hidden calls Notification (mocked) and sets the title | Clicking the notification focuses the node |
| L18 | RepoPicker (recent repos, path field), SpawnDialog from GET /api/agents with worktree and prompt fields, SettingsPanel (font size, custom agents) | spawn.test.tsx: submitting posts the chosen agent to POST /api/consoles | A new user opens a repo and spawns a console with no documentation |
| L19 | The agentboard bin: start (daemon foreground), open [path] (read daemon.json, ping, else spawn a detached daemon, open the browser on the token URL), status (JSON) | cli.test.ts: open with no daemon spawns one (mocked) and prints the URL | `agentboard open .` shows the board |
| L1A | daemon/src/app.ts wiring state, pty, server, status, agents; ui/src/app.tsx wiring board, console, status, shell; packages/e2e Playwright: six consoles, p95 keystroke echo under 50 ms, memory under 1 GB, foreign-origin refusal, reload shows the consoles | The six-console smoke, failing until the wiring exists | The gate runs the e2e and passes; dogfood can begin |
| L20 | GitService: worktreeAdd(repo, name, base) into .worktrees/<name> with an exclude entry; worktreeRemove refusing dirty or unpushed work unless forced; status(path) {branch, ahead, behind, dirty, lastCommit}; diff(path) {files, patch}; commit, push, createPr through gh; the /api/git routes | git.test.ts on a temporary repo: add creates the branch; remove with an uncommitted change throws | Tests pass with gh mocked, no network |
| L21 | GitCard on the console node and a DiffView panel (file list, unified diff) | git-card.test.tsx: renders a status fixture; clicking diff loads /api/git/diff | Playwright: two worktree consoles show different branches |
| L22 | openIn(editor, path) for code, zed, finder; a route and three buttons | open.test.ts: spawns the right command (mocked) | The button opens VS Code |
| L23 | CLI subcommands spawn <agent> [--worktree] [--prompt] [--repo], note <text>, status --json; daemon.json, auto-start, JSON output, AGENTBOARD_CONSOLE_ID passed as callerConsoleId | cli-spawn.test.ts: spawn posts the right body to a mocked daemon | An agent's Bash tool can run it and parse the result |
| L24 | `agentboard mcp` over stdio with tools open_board, spawn_console, list_consoles, add_note, get_status on L23's client; registration snippets for Claude Code, Codex, Gemini CLI, OpenCode | mcp.test.ts: spawn_console returns the console id (mocked daemon) | `claude mcp add agentboard` lists the five tools |
| L25 | packages/plugins/claude: plugin.json, a /board command, hooks posting status to AGENTBOARD_URL and exiting silently without it | hooks.test.ts: exits 0 with no environment, posts with it | A plain claude session with the plugin shows as a node while the daemon runs |
| L26 | The L05 plugin released as @agentboard/opencode-plugin with an agentboard_spawn tool and an install note for opencode.json | The L05 test extended for the tool | From OpenCode, the agent spawns a console |
| L27 | Playwright: start the daemon, a fake agent calls agentboard spawn and the MCP tool, two consoles in two worktrees edit the same repo, both branches show on their git cards | The scenario, failing until the pieces exist | The gate 2 checklist passes |
| L30 | In packages/shared: TextNodeSchema {type "text", markdown}; ImageNodeSchema {type "image", assetId, width, height, alt}; WebTileNodeSchema gains optional capture boolean; Workspace gains optional ink: Stroke[] ({id, points: [x,y][], color, width}) and layouts: SavedLayout[] ({name, nodes: Record<id, {x,y,w,h}>}); BoardNode union extended; routes POST /api/assets (raw image body, response {id, width, height}), GET /api/assets/:id, GET /api/preview (response {key}); fixtures for every new node; migrate keeps old boards loading | schemas.test.ts: a board fixture with a text, image and ink stroke round-trips; a board file without ink or layouts still parses | Every new field has a schema, a fixture and a type export; the first commit (schemas) is pushed at once so stacked lanes can start |
| L31 | WebTileView: an iframe on node.url (loopback URLs only, else a hint), an address field that saves on Enter, Reload, Open in a new tab, a Capture toggle that loads the page through /preview/<key>/<encoded url> when GET /api/preview answers and shows an Inspector panel (Console and Network tabs) filled from postMessage events whose origin is the daemon's; nodrag and nowheel over the iframe; a webtile entry for the Add menu exported as webtileAdds | webtile.test.tsx: renders the iframe with the node's url; a postMessage console event appears in the Inspector | A localhost page shows in a tile and its console.error lands in the Inspector when capture is on |
| L32 | Preview proxy: GET /preview/<key>/<url>, key = first 32 hex of sha256(the launch secret), never the secret itself; target host must be localhost, 127.0.0.1 or ::1; GET only; no cookie or authorization header forwarded; response streamed with the target's content type, and for text/html a <base href> plus one injected script that forwards console.*, window errors, unhandled rejections and fetch or XHR summaries to window.parent.postMessage with the board's origin; everything else passes through; served with a CSP that forbids the proxied document from calling /api/* | preview.test.ts: a target html page comes back with the script injected; a non-loopback target is 403; a wrong key is 404; a POST is 405; no cookie or authorization header reaches the target | A page under a local dev server shows in the web tile with its console lines captured; the security tests pass |
| L33 | NoteView becomes editable (textarea, saves on blur, 300 ms debounce), TextView renders a markdown subset (headings, paragraphs, lists, bold, italic, inline code, fenced code, links) with an Edit toggle, ChecklistView with checkboxes, an add-item field and a done count ("1/3"); AddMenu in the top bar built from an items array (label, create(position)) and noteAdds for Note, Text and Checklist; nodes created at the viewport centre | notes.test.tsx: typing in a note saves the text to the store; ticking a checklist item flips done; markdown renders a heading and a code block without raw tags | Notes, text and checklists are created from the Add menu, edited in place, and survive a reload |
| L34 | AssetStore under ~/.agentboard/assets/<sha256>.<ext> for png, jpeg, gif and webp only (no svg), 10 MB cap, dimensions read from the header; POST /api/assets and GET /api/assets/:id (gated like every route, immutable cache headers); ImageView rendering /api/assets/<id> at the node's size; drop and paste of an image on the board pane creates an image node where it lands; imageAdds for the Add menu (file picker) | assets.test.ts: a PNG posted comes back by id with its width and height; an svg is 415; 11 MB is 413. image.test.tsx: a dropped file posts to /api/assets and adds a node | An image dropped on the board shows at its size and is still there after a reload |
| L35 | InkLayer rendered in React Flow's viewport portal under the nodes: an SVG of the workspace's strokes; an Ink toolbar (Pen, Eraser, Done, colour and width) that, while active, captures pointer events on the pane and appends strokes in flow coordinates; strokes saved through the board store; Escape leaves ink mode; no global key handlers while a terminal has focus | ink.test.tsx: a pointer drag in pen mode adds one stroke with the pointer's flow coordinates; the eraser removes a stroke it crosses | A stroke drawn over two consoles stays aligned under pan and zoom and survives a reload |
| L36 | applyLayout(ws, preset, selectedId) for grid (2 by 2 or n by n), row, preview-plus-consoles (web tiles left at 60 percent, consoles stacked right), focus (the selected node at 80 percent, the rest parked in a right column); a Layout menu with the four presets, their shortcuts (meta or ctrl plus shift plus 1 to 4, ignored while a terminal has focus), Save current layout as a named entry in workspace.layouts, and the saved entries to re-apply or delete | layout.test.ts: four consoles under grid get a 2 by 2 arrangement with gaps; focus puts the selected node first. layout.test.tsx: the shortcut applies a preset | Presets rearrange the active workspace and a saved layout comes back after a reload |
| L37 | extras.spec.ts: against a real daemon with the fake agent, a static localhost page served by the test: add a web tile to that page, turn capture on and read a console line in the Inspector; add a note and a checklist and tick one item; drop a PNG; draw a stroke; apply the grid preset and save a layout; reload and assert every piece is still there; test:e2e runs it | The scenario, failing until the pieces exist | The phase 3 gate checklist passes |

## Governor and worker playbooks

Start the governor once:

```bash
cd ~/KapilProjects/claudevibe
claude --name governor --model claude-fable-5-1
/govern init          # labels, one issue per lane, the pinned Decisions issue
/loop 15m /govern     # a tick every 15 minutes
```

One tick (`.claude/commands/govern.md`): read state (git pull, gh issue list, claude agents --json --all); settle finished workers; gate and review every PR labeled review in parallel and merge or send findings; fill the queue up to PARALLEL with `scripts/dispatch.sh <lane>`; unblock or escalate blocked workers; close a phase with its gate checklist and a needs-owner issue; end with one summary line.

Dispatch (`scripts/dispatch.sh L11`):

```bash
claude --bg --name L11 -w L11 --model claude-sonnet-5-5 --permission-mode auto \
  --settings "$(scripts/worker-settings.sh L11)" "$(cat .claude/briefs/L11.md)"
```

A feedback round: `claude --resume <session-id> --bg "Review findings on PR #n: ... Fix, rerun scripts/gate.sh, push, comment on the PR."`

Watching: `claude agents`, `claude attach L11`, `claude logs L11`, `gh pr list`, the Decisions issue.

## Files this plan adds

CLAUDE.md · .claude/settings.json · .claude/worker-settings.json · .claude/hooks/guard.sh and guard-test.sh · .claude/commands/govern.md · .claude/briefs/TEMPLATE.md · .claude/review-prompt.md · .claude/pr-template.md · scripts/setup.sh · scripts/gate.sh · scripts/dispatch.sh · scripts/worker-settings.sh · scripts/merge.sh · .gitignore · .npmrc · this plan.

To start: read the files; `scripts/setup.sh` (asks before creating the private repo); `claude --name governor --model claude-fable-5-1`; `/govern init`; `/loop 15m /govern`; watch with `claude agents`.

## Risks and open questions

| Risk | Impact | Mitigation |
| --- | --- | --- |
| auto permission mode unavailable or too strict | Workers block | `AGENTBOARD_PERMISSION_MODE=bypassPermissions`; the guard and deny rules still run |
| Six workers drain the rate window | Lanes pause | Sonnet workers, Opus reviewers, one Fable; lower PARALLEL at 80 percent usage; never touch billing |
| node-pty prebuilds fail with scripts off | L00 blocks everything | L00 allows `npm rebuild node-pty` in the gate |
| Governor context fills over a long loop | Slow ticks | The tick is idempotent from GitHub and session state; /compact or a fresh governor resumes |
| Two lanes touch one file | Merge conflict | Exact paths per lane; the second rebases; the reviewer flags out-of-scope files |
| Background sessions idle-stop after an hour | A worker disappears | Finished workers are meant to stop; feedback resumes the saved conversation by id |
| A worker prints a secret into its log | It lands in a PR comment | printenv and env refused; gate output tail-limited; gitleaks on the range |

Open for the owner (defaults apply until answered):

- [ ] PARALLEL: 6 to start, 8 with headroom.
- [ ] Models: workers Sonnet, reviewers Opus, governor Fable.
- [ ] Repo name `agentboard` and the day it goes public (MIT assumed).
- [ ] Overnight unattended runs under the ShopperStop rules: decide everything, record it, never touch limits or billing.
