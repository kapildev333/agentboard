# Status and security

## The six statuses

| Status | Badge | Meaning |
| --- | --- | --- |
| `starting` | Starting | The process was just launched |
| `working` | Working | The agent is busy |
| `idle` | Idle | The agent finished its turn and waits for your next message |
| `needs_you` | Needs you | The agent is asking for permission or input |
| `exited` | Exited | The process ended |
| `stopped` | Stopped | Nothing is running: the console was loaded from disk after a daemon restart |

The daemon owns every status. It saves the status with the board and pushes each change to open pages over the WebSocket, where it drives the badge, the mission map, the tab title and notifications. `agentboard status --json` and the MCP `get_status` tool read the same value.

## Where each status comes from

The status table lives in `packages/shared/src/status-map.ts`. The output rules live in `packages/daemon/src/status/index.ts`.

### Claude Code: hooks

| Event | Status |
| --- | --- |
| `UserPromptSubmit`, `PreToolUse` | working |
| `Stop` | idle |
| `Notification` with `notification_type` of `permission_prompt`, `idle_prompt`, `agent_needs_input` or `elicitation_dialog` | needs you |
| `PermissionRequest` | needs you |
| `SessionEnd`, unless its reason is `clear` or `resume` | exited (not final: Claude keeps running after `/clear`) |

`PreToolUse` moves a console back from needs you to working once you approve a tool. A denied permission or an interrupt sends no `Stop`, so the console stays in its last state until the next event.

### Gemini CLI: hooks

`BeforeAgent` means working, `AfterAgent` means idle, and `Notification` means needs you.

### OpenCode: plugin events

| Event | Status |
| --- | --- |
| `session.status` with status `busy` | working |
| `tool.execute.before` | working |
| `session.idle` | idle |
| `permission.asked` | needs you |

### Codex: notify and output

- Codex's `notify` sends only `agent-turn-complete`, which means idle.
- Output counts as work only after you press Enter in the console. From then until the next `agent-turn-complete`, output means working.
- The first output after launch, before you have typed anything, means idle.
- Codex has no quiet timer and no needs-you signal in this version.

### Custom agents: output

| Output | Status |
| --- | --- |
| Any output | working |
| No output for 20 seconds | idle |
| Output matching the agent's needs-you regex (Settings) | needs you, held through the prompt the CLI redraws after its question, until you type in the console |

Your own typing is echoed by the program, and the echo counts as output, so typing makes a custom console briefly working.

### Rules for every agent

- **Hooks take over from output.** Until a Claude, Gemini or OpenCode console's first recognised hook event arrives, its status comes from its output like a custom agent's: output means working, 20 quiet seconds mean idle. From the first event on, the hooks own the status and output is ignored. A console whose hooks are broken therefore still shows something useful.
- **Process exit is final.** When the process ends the console is exited, and no later event changes that until you resume it.
- **Foreign sessions are ignored.** A hook post whose `session_id` differs from the console's recorded session is dropped. A nested `claude -p` run inherits the console's id and would otherwise report as its parent.
- **Repeats change nothing.** A repeated status emits nothing, so the double posts from the Claude plugin are harmless.
- **The session id is stored for Resume.** The daemon takes Claude's id at spawn, Codex's from `thread-id`, Gemini's from `session_id`, and OpenCode's from `session.created`.

## The security model

The daemon runs agents that can edit your files and run commands, so nothing but you may reach it. It is built so that no web page, no other user on a shared machine and no other program without the token can use it.

### Where it listens

- The daemon binds to `127.0.0.1` only, on a random free port chosen at each start. It never binds to `0.0.0.0` or `::`.
- It writes `~/.agentboard/daemon.json` as `{port, token, pid}`, mode 600, inside a folder of mode 700. It writes a temporary file and renames it into place. The temporary file is opened exclusively, so a planted file fails the write.

### The token

- 32 random bytes, base64url, made fresh at every start. The server refuses to start with a token shorter than 32 characters.
- Scripts and tools send it as `X-AgentBoard-Token: <token>` or `Authorization: Bearer <token>`. The daemon compares it in constant time.
- It is never accepted in a URL (`?token=` gets 401), never printed by `agentboard start`, and never placed in a hook's command line. Hooks read it from the console's environment.

### Browser login

- **Getting a code.** `POST /auth/code` returns a one-time code, and only to a caller holding the token in a header. A page holding the session cookie cannot mint codes.
- **The code.** 24 random bytes, single-use, valid for 60 seconds.
- **Using the code.** `GET /?code=<code>` checks the Host, Origin and Sec-Fetch-Site rules below, then takes the code. It sets `agentboard_<port>=<random session>; HttpOnly; SameSite=Strict; Path=/` and redirects to the same URL without `code`. The cookie name carries the port because SameSite ignores ports. The value is a session id held in memory, never the token.
- **Lifetime.** Sessions end when the daemon stops.

### Checks on every request and WebSocket upgrade

| Check | Rule | Stops |
| --- | --- | --- |
| Host | Must be `127.0.0.1:<port>` or `localhost:<port>` | DNS rebinding |
| Origin | When present, must be `http://127.0.0.1:<port>` or `http://localhost:<port>` | Other sites and other localhost ports |
| Sec-Fetch-Site | When present, must be `same-origin` or `none` | Cross-site requests |
| Authentication | Token header, or a known session cookie | Everyone else |
| Cookie proof | A cookie request must carry an Origin (always, for writes and WebSockets) or, on a GET, a Sec-Fetch-Site | A cookie used outside the board's own page |

- No CORS headers are ever sent.
- Every response carries `Content-Security-Policy: frame-ancestors 'none'`, so no page can frame the board.
- Request bodies and WebSocket messages over 1 MB are refused.
- The static file server never serves outside `packages/ui/dist`.

### What is refused

These answers were checked against a running daemon:

| Request | Answer |
| --- | --- |
| No token, no cookie | 401 |
| Wrong token | 401 |
| `?token=<the right token>` in the URL | 401 |
| A used, unknown or expired login code | 401 |
| Right token, `Host: evil.example:<port>` | 403 |
| Right token, `Origin: http://evil.example` | 403 |
| Right token, `Sec-Fetch-Site: cross-site` | 403 |
| The board's cookie from `Origin: http://127.0.0.1:1` (another local port), on GET, PUT or a WebSocket upgrade | 403 |
| Right token, `Host: localhost:<port>` | 200 |
| `Authorization: Bearer <token>` | 200 |

### Other safeguards

- **No auto-approve.** No agent is launched with an auto-approve flag, and nothing on the board answers a permission prompt for you.
- **Open-in.** The open-in route accepts only `code`, `zed` and `finder`. The path must be absolute and resolve to a directory, and the daemon passes the resolved target, never a link. On macOS, Finder reveals the folder (`open -R`) rather than opening it, so a folder named like an app is never launched.
- **Worktrees.** Worktree and branch names starting with `-` are refused, so they cannot be read as git options.
- **Prompts.** A first prompt starting with `-` is passed after `--` or as `--flag=value`, never as a flag.
- **Settings and hooks.** Gemini's per-launch settings file is written with mode 600 inside a fresh private temporary folder.
- **Nothing leaves the machine.** No telemetry, no accounts, no outbound calls. The only network traffic is what your agents and `git push` or `gh` make themselves.
