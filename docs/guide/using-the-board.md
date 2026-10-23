# Using the board

One daemon serves one board per repository. The board for a repository is keyed by its absolute path, so `~/code/app` and its linked worktree `~/code/app/.worktrees/x` are different boards if you open both. Consoles spawned into a worktree from the board stay on the main repository's board.

## Spawning a console

**Spawn console** opens a dialog with these parts:

- **Agent.** The list comes from `GET /api/agents`. When the dialog opens, the daemon looks up `claude`, `codex`, `gemini` and `opencode` on its PATH and runs `<cli> --version` on each one it finds, with a 3-second limit. It reads that PATH once, from your login shell, at start. The list shows each agent's version, or "not installed" greyed out, followed by your custom agents.
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
| Lock the canvas | The lock control |
| Jump around | Drag or click in the minimap |
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
- Mouse selection inside a terminal is offset at any zoom other than 100%. Select text at 100% zoom.

## Workspaces

The tabs in the top bar are workspaces. Each one has its own nodes and view.

- Click a tab to switch to it.
- Double-click a tab to rename it; Enter saves and Escape cancels.
- `+` creates `Workspace N` and switches to it.
- `×` deletes the active workspace and every node on it. It appears only while more than one workspace exists.

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
- **Commit:** a message field; Submit runs `git add -A` and `git commit -m <message>`. "nothing to commit" is reported inline.
- **Push:** `git push -u origin HEAD`.
- **Open PR:** `gh pr create --title <last commit subject> --body ""` in that folder, then opens the pull request URL it prints. `gh` must be installed and logged in.

Errors from git or gh appear under the buttons.

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
