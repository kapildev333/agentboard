# Using the board

One daemon serves one board per repository. The board for a repository is keyed by its absolute path, so `~/code/app` and its linked worktree `~/code/app/.worktrees/x` are different boards if you open both. Consoles spawned into a worktree from the board stay on the main repository's board.

## Spawning a console

**Spawn console** opens a dialog with these parts:

- **Agent.** The list comes from `GET /api/agents`. Building it never runs an agent (ruling D38).
  - **The agent PATH.** The daemon looks up `claude`, `codex`, `gemini` and `opencode` on the agent PATH: `AGENTBOARD_AGENT_PATH` when it is set, otherwise the PATH of your login shell, read once at start.
  - **Available.** An agent counts as available when an executable file of that name is on that PATH. Any other agent shows "not installed", greyed out.
  - **Version.** The version appears only after that agent's first console has started: at launch the daemon runs `<cli> --version` once, with a 3-second limit, and remembers the answer.
  - **Custom agents** follow the four built-in ones.

  A console always runs the file found on the agent PATH. When none is there, the spawn is refused with `<agent> is not on the agent PATH`.
- **new worktree.** When ticked, a branch name is required. The daemon runs `git worktree add -b <branch> <repo>/.worktrees/<branch> <current branch>`, adds `.worktrees/` to the repository's `.git/info/exclude` (never to `.gitignore`), and starts the agent in the new folder. The console's title becomes `<Agent>: <branch>`. A branch name that starts with `-` is refused. A branch or folder that already exists makes the spawn fail.
- **first prompt.** Optional. It reaches the agent as its opening message:
  - `claude -- <prompt>` and `codex -- <prompt>`
  - `gemini --prompt-interactive=<prompt>` and `opencode --prompt=<prompt>`

  Custom agents ignore it. A prompt that starts with `-` is never read as a flag.

Every console starts in an 80 by 24 terminal that resizes to fit its node. It gets your login shell's environment plus these variables:

| Variable | Value |
| --- | --- |
| `AGENTBOARD_URL` | `http://127.0.0.1:<port>` |
| `AGENTBOARD_CONSOLE_ID` | This console's id |
| `AGENTBOARD_TOKEN` | The daemon's token, for hooks and plugins |
| `AGENTBOARD_AGENT` | `claude`, `codex`, `gemini`, `opencode` or `custom` |

The command line for each agent:

| Agent | Launch | Resume |
| --- | --- | --- |
| Claude Code | `claude --session-id <new uuid> --name <title> --settings <inline hooks>` | `claude --resume <session id> …` |
| Codex | `codex -c notify=[<node>, <relay>]` | `codex resume <thread id> -c …` |
| Gemini CLI | `gemini`, with `GEMINI_CLI_SYSTEM_DEFAULTS_PATH` set to a private settings file holding the hooks | `gemini --resume <session id>` |
| OpenCode | `opencode`, with `OPENCODE_CONFIG_CONTENT` loading the AgentBoard plugin | `opencode --session <session id>` |
| Custom | `<command> <args…>` | Starts fresh |

No agent is ever started with an auto-approve flag. Claude's session id is picked by the daemon at spawn. Codex, Gemini and OpenCode report theirs in their first hook event, and the daemon stores it on the console for Resume.

## Where consoles land

- New consoles fill a grid of three columns, each console 520 by 340 with a 40-pixel gap, in the active workspace.
- A console spawned by another console (`agentboard spawn` or `spawn_console` run inside it, or the OpenCode `agentboard_spawn` tool) goes into its parent's workspace, to the right of the parent.
- A console spawned from the CLI with no parent lands on the board of the repository that contains the current directory. When that board is not loaded in the daemon, it lands on a board for the directory itself.

## Moving around

| Action | How |
| --- | --- |
| Pan | Scroll or two-finger swipe on the canvas, or drag the empty canvas |
| Zoom (25% to 200%) | Pinch, scroll while holding Cmd (Ctrl on Linux and Windows), or the `+` and `−` controls |
| Fit everything | The fit-view control (square icon) |
| Lock the nodes | The lock control stops dragging and selecting nodes; panning and zooming still work |
| Jump around | Drag in the minimap to pan, or scroll over it to zoom; clicking it does nothing |
| Move a console | Drag its title bar; the terminal body never starts a drag |
| Resize | Click a node to select it, then drag its edges or corners (minimum 120 by 80) |
| Remove a node | Select it and press Backspace; removing a console ends it |

Layout changes are saved 500 ms after your last change. Each workspace remembers its own zoom and position.

## The terminal

- Clicking into a terminal focuses it. A focused terminal takes every key, scroll and mouse event, so Vim, htop and Ctrl-C work as in a normal terminal. Click the canvas to give scrolling back to the board.
- Scrollback holds 10,000 lines.
- Copy and paste follow your system:
  - On macOS, Cmd+C copies the selection and Ctrl+C always reaches the program.
  - On Linux and Windows, Ctrl+C copies when text is selected and otherwise reaches the program as an interrupt.
  - Cmd+V (Ctrl+V on Linux and Windows) pastes.
- Reloading the page, or opening the board in another tab, replays roughly the last 200,000 characters of each console's output, then streams live.
- `[exited]` appears under a terminal whose process has ended.

## Workspaces

The tabs in the top bar are workspaces. Each one has its own nodes and view.

- Click a tab to switch to it.
- Double-click a tab to rename it; Enter saves and Escape cancels.
- `+` creates `Workspace N` and switches to it.
- `×` deletes the active workspace and every node on it, at once and with no confirmation. Every console on it is ended. The button appears only while more than one workspace exists.

The board remembers the active workspace.

## Status, the mission map and notifications

Each console's title bar carries a badge: **Starting**, **Working**, **Idle**, **Needs you** (solid red, bold), **Exited** or **Stopped**. [Status and security](status-and-security.md) describes how each agent's status is worked out.

The mission map on the right lists the active workspace's consoles grouped as Needs you, Working, Idle, Starting, Stopped, then Exited. Each row shows the title and the agent. Clicking a row focuses that console's terminal. It does not pan the canvas, so use the minimap for a console that is out of view.

While any console on the board needs you, the tab title reads `(N) AgentBoard`. When a console turns Needs you while the tab is hidden, the browser shows a notification titled `<console> needs you` with the agent's name. Clicking it raises the tab and focuses that console. The page asks for notification permission on your first click or key press. If you decline, the title badge still works.

## Resume and restarts

- **Closing the tab ends nothing.** The consoles keep running in the daemon. Reopen the board and they are still there, with their recent output.
- **After a daemon restart,** every console reappears where it was, marked **Stopped**, with a **Resume** button. Resume runs the agent's own resume command (table above) with the stored session id. When an agent never reported a session id, Resume starts it fresh, and Claude gets a new session id. Custom agents always start fresh.
- **A console whose process exited** also shows **Resume**.
- **Close** on a console ends its process (SIGHUP, then SIGKILL after 5 seconds) and removes it from the board.

## The git card

**Git** on a console toggles a card for the console's folder (its worktree, if it has one):

- **Status line:** the branch, ahead and behind counts against the upstream, the number of changed files, and the last commit's subject. It refreshes every 10 seconds.
- **Diff:** lists the files changed against `HEAD` with their status letter and shows the unified diff. Untracked files are not listed.
- **Commit:** a message field; Submit runs `git add -A` and `git commit -m <message>`.
- **Push:** `git push -u origin HEAD`.
- **Open PR:** `gh pr create --title <last commit subject> --body ""` in that folder, then shows the pull request URL it prints as a link. `gh` must be installed and logged in.

One action runs at a time, and the status line refreshes after a commit or push.

When an action fails, the card shows only "internal error" under the buttons: the daemon answers every git or gh failure with a bare 500. That covers a commit on a clean tree, a push with no remote, and `gh` missing or logged out. Run the same command in the console's terminal to see the real message.

## Open in VS Code, Zed or Finder

The buttons under the git card open the console's folder:

| Button | Command |
| --- | --- |
| VS Code | `code <path>` |
| Zed | `zed <path>` |
| Finder | `open -R <path>` on macOS (reveals the folder), `explorer <path>` on Windows, `xdg-open <path>` on Linux |

The daemon runs these commands with its own PATH, so `code` and `zed` must be on the PATH of the shell that started the daemon. In VS Code, run "Shell Command: Install 'code' command in PATH". The path is resolved through symlinks first and must be an existing directory.

## Notes

A note is a yellow card holding text. You add one from a terminal or an agent; this version cannot create or edit notes on the page.

- `agentboard note "<text>"` puts it under the lowest node of the active workspace.
- The MCP `add_note` tool puts it at the top-left of the active workspace.

A note added from the CLI or MCP appears on every open page at once, with no reload. It works like this:

- **The daemon tells the other pages.** It saves the board, raises the board's `rev` number, and sends the board to every open page except the one that saved it, over a `board` WebSocket message.
- **The page merges what it receives:**
  - From the daemon it takes nodes added or removed elsewhere, a note's text, and each console's status.
  - It keeps its own viewport, and the position and size of any node you moved since its last sync.
  - It also keeps any node it added or removed itself since then.
- **A stale save is refused.** A save from a page holding an older `rev` than the daemon answers `409`. The page then re-reads the board from the daemon, and edits it had not yet saved are dropped.

**One limit:** two tabs on the same board are not supported in this version. The spec says a second open should focus the existing tab, which is not built yet. With two tabs open, a save from one can make the other re-read and drop its unsaved layout changes.

Select a note and press Backspace to remove it.

## Settings and custom agents

**Settings** edits `~/.agentboard/settings.json`, saving on every change:

- **font size:** the terminal font size, 10 to 24. It is clamped when the field loses focus.
- **Add agent:** adds a custom agent row with four fields:
  - **name** is shown in the spawn dialog and as the console title.
  - **command** is the executable, either a name on your PATH or an absolute path.
  - **args** are space-separated arguments. Quoting is not supported.
  - **needs-you regex** is a JavaScript regular expression tested against each chunk of output. A match marks the console Needs you until you type. An invalid expression makes the spawn fail with `invalid needs-you rule for <name>`.

  **Remove** deletes the row.

The file looks like this:

```json
{
  "fontSize": 13,
  "customAgents": [
    { "id": "3c1f…", "name": "Aider", "command": "aider", "args": ["--no-auto-commits"], "needsYou": "\\(Y\\)es/\\(N\\)o" }
  ]
}
```

A custom agent's status comes from its output alone; see [Status and security](status-and-security.md).
