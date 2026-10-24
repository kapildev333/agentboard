# Where the usage numbers come from

The Usage view reads each CLI's own session logs on this disk. No network, no estimates. Code: `packages/daemon/src/usage`.

Parsed files are cached in `~/.agentboard/usage.json`, one entry per file with its path, size and mtime and the sessions parsed from it (P4-D46: JSON, not sqlite). A refresh re-parses only files whose size or mtime changed and drops files that are gone. A file a parser does not recognise is skipped and not counted in `sources[].files`.

Every parser was written against invented fixtures in `packages/daemon/test/usage/fixtures`; no real session log is in the repo. Only Claude Code's layout was checked against a real install. The other three CLIs are not run here (CLAUDE.md forbids running third-party agent binaries), so their fields come from their published formats, and the owner confirms them at the phase 4 gate.

## Token fields

Every agent reports the same three numbers:

- **input**: fresh input plus cache writes, meaning every input token that was not a cache hit.
- **output**: output tokens, reasoning included.
- **cacheRead**: input tokens served from the prompt cache.

A day's bar and a group's total add up all three.

## Claude Code

- Path: `~/.claude/projects/<project slug>/**/*.jsonl` (one file per session; subagent files under the session's folder count too). Also `<CLAUDE_CONFIG_DIR>/projects` for each claude profile.
- Checked against: Claude Code 2.x.
- Fields:
  - `sessionId`: the session.
  - `timestamp`: bounds the session (first and last line).
  - `cwd`: the repo group.
  - `type: "assistant"` lines: `message.usage.input_tokens`, `cache_creation_input_tokens`, `output_tokens` and `cache_read_input_tokens`.
  - `message.id` and `requestId`: one reply is written once per content block, so each pair counts once.

## Codex CLI

- Path: `~/.codex/sessions/**/*.jsonl` (`YYYY/MM/DD/rollout-*.jsonl`). Also `<CODEX_HOME>/sessions` for each codex profile.
- Checked against: the 0.4x rollout format (not run here).
- Fields:
  - `type: "session_meta"`: `payload.id`, `payload.cwd` and `timestamp` (the start).
  - `type: "event_msg"` with `payload.type: "token_count"`: the running `payload.info.total_token_usage.{input_tokens, cached_input_tokens, output_tokens}`.
  - `input_tokens` includes the cached part, so input = `input_tokens - cached_input_tokens` and cacheRead = `cached_input_tokens`.
  - The last total is the session's. Each increase over the previous total is one turn.

## Gemini CLI

- Path: `~/.gemini/tmp/<project hash>/logs.json` and `~/.gemini/tmp/<project hash>/chats/*.json`.
- Checked against: the 0.x format (not run here).
- Fields:
  - `logs.json`: an array of `{sessionId, timestamp}` user prompts. It has no token counts, so it only bounds a session.
  - `chats/*.json`: `sessionId`, then `messages[]` where `type: "gemini"` carries `timestamp` and `tokens.{input, output, cached}`. `input` includes the cached part.
  - Neither file records a working directory, so gemini sessions group under "Unknown folder" by repo.
- Profiles: none, because no config-dir variable is known.

## OpenCode

- Path: `~/.local/share/opencode/storage/message/<sessionID>/*.json` and `~/.local/share/opencode/storage/session/<projectID>/*.json`. Also `<XDG_DATA_HOME>/opencode` for each opencode profile.
- Checked against: the 0.x file layout (not run here).
- Fields:
  - Message files: `sessionID`, `role` and `time.{created, completed}` (epoch ms).
  - Assistant messages also have `tokens.{input, output, cache.read, cache.write}` and `path.cwd`. Input excludes the cache, so input = `input + cache.write`.
  - Session files: `id`, `directory` and `time.{created, updated}`.
  - Each file is one part of a session, and the report merges parts by session id.

## How the report counts

- A session counts on the local day it started.
- Median session length runs from the session's first timestamp to its last.
- Group by console matches a session id to a board console's `session.id`. Sessions on no board group as "Not on the board".
- Needs-you waits run from each `status` event with `needs_you` to that console's next status event, or to now. They read 0 until the event log (L42) is passed in.
- `tokensSince(consoleId, from, to)` sums the console's per-reply turns inside the window, and is null when the console's session has no parsed log.
