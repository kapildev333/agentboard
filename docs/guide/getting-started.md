# Getting started

AgentBoard is not published to npm. You build it from a checkout and link its commands onto your PATH. Never run `npx agentboard`: that npm name belongs to an unrelated package.

## Requirements

- Node 22 and npm 10.
- git. `gh` is needed only for the git card's **Open PR** button.
- A current browser. The end-to-end tests run Chromium.
- macOS. Linux should work, but nobody has tested it, and node-pty ships no Linux prebuild, so you may need `npm rebuild node-pty`. Windows is not supported yet.
- At least one agent CLI on your PATH: `claude`, `codex`, `gemini` or `opencode`. Without one, you can still run any command as a custom agent (see [Using the board](using-the-board.md#settings-and-custom-agents)).

## Install from the checkout

```sh
git clone https://github.com/kapildev333/agentboard.git
cd agentboard
npm ci
npm run fix-pty
npm run build
npm link -w @agentboard/cli
npm link -w @agentboard/mcp      # optional: the MCP server, see cli-and-mcp.md
```

What each step does:

- `npm ci` installs exact versions with install scripts turned off (`.npmrc` sets `ignore-scripts=true`).
- `npm run fix-pty` runs `chmod +x` on node-pty's prebuilt `spawn-helper`. With install scripts off, the helper arrives without its execute bit, and every console then fails with `posix_spawnp failed`. Run it again after every `npm ci`.
- `npm run build` builds `shared` first, then the daemon, the CLI, the MCP server, the OpenCode plugin bundle and the UI (`packages/ui/dist`). The daemon serves the UI from that folder.
- `npm link -w @agentboard/cli` puts `agentboard` on your PATH as a link to `packages/cli/bin/agentboard.js`. It follows your checkout: after a `git pull`, run `npm ci && npm run fix-pty && npm run build` again, with no new link.

Check it:

```sh
agentboard status --json
# {"alive":false}       (exit code 1: no daemon yet)
```

## Open a repository

```sh
cd ~/code/your-repo
agentboard open .
```

`open` takes an optional path, `.` by default. The path must be a directory; otherwise the command prints `agentboard: not a directory: <path>` and exits 1. The command then does three things:

1. It reads `~/.agentboard/daemon.json`. If a daemon is listed there and answers, `open` uses it. Otherwise it starts `agentboard start` detached, in the repository's folder, and waits up to 10 seconds for it to answer.
2. It asks the daemon for a one-time login code (`POST /auth/code` with the token).
3. It opens `http://127.0.0.1:<port>/?code=<code>&repo=<absolute path>` in your browser (`open` on macOS, `xdg-open` on Linux) and prints the same URL.

The board loads in well under a second. With the daemon already running, the command takes about half a second.

## Logging in

The browser never sees the daemon's token. The URL carries a one-time code instead:

- The code works once and expires 60 seconds after `agentboard open` printed it.
- On the first request the daemon checks the code. It then sets a session cookie named `agentboard_<port>` (`HttpOnly`, `SameSite=Strict`) and redirects to the same page without `code`.
- The session lasts until the daemon stops. Closing and reopening the tab, or opening `http://127.0.0.1:<port>/?repo=<path>` again, needs no new code in the same browser.
- After a daemon restart the port changes and old sessions are gone. Run `agentboard open .` again.

A used or expired code gets an empty `401` page. A page whose session the daemon no longer knows shows "Not logged in: run `agentboard open` in the repo to get a fresh login link."

## What the browser shows

- **Top bar:** the repository's folder name (hover for the full path), the workspace tabs (`main` on a new board, `+` to add one), then **Spawn console** and **Settings** on the right.
- **Canvas:** an empty dotted canvas with zoom controls at the bottom left and a minimap at the bottom right.
- **Mission map:** a column on the right that lists consoles by status once there are any.

Opening `http://127.0.0.1:<port>/` with no `repo` shows a repository picker. It lists the repositories you opened recently in this browser (up to 10) and has a path field.

## Your first console

1. Click **Spawn console**. The dialog lists `claude`, `codex`, `gemini` and `opencode`, each with its version, or greyed out as "not installed", followed by your custom agents.
2. Pick one. Optionally tick **new worktree** and type a branch name, or type a first prompt.
3. Click **Spawn**. A 520 by 340 console appears and its badge moves from Starting to Idle or Working.
4. Click into the terminal and type. The terminal takes every key and scroll until you click elsewhere.

From a terminal, `agentboard spawn claude` does the same and prints the new console as JSON.

## Stopping

- A daemon started by `agentboard open` runs in the background with no terminal. Stop it with `kill <pid>`, using the pid from `agentboard status`.
- A daemon started with `agentboard start` runs in the foreground; stop it with Ctrl-C.

On either signal, the daemon closes its port, ends every console (SIGHUP, then SIGKILL after 5 seconds), writes the boards and deletes `daemon.json`. The next `agentboard open` shows every console as **Stopped**, with **Resume**.

Next: [Using the board](using-the-board.md).
