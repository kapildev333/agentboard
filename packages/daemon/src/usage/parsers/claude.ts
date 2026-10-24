// Claude Code session logs: <root>/<project slug>/<sessionId>.jsonl, root ~/.claude/projects (or <CLAUDE_CONFIG_DIR>/projects),
// checked against Claude Code 2.x. Every line with sessionId and timestamp bounds the session; a line with type "assistant"
// carries message.usage.{input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens} and cwd.
// One reply is written once per content block with the same message.id and requestId, so each pair counts once.
import { lines, num, time, type Parse, type Session } from "./index.js";

export const parseClaude: Parse = (text) => {
  const sessions = new Map<string, Session>();
  const seen = new Set<string>();
  for (const l of lines(text)) {
    const id = l.sessionId, ts = time(l.timestamp);
    if (typeof id !== "string" || Number.isNaN(ts)) continue;
    let s = sessions.get(id);
    if (!s) sessions.set(id, (s = { agent: "claude", id, cwd: "", start: ts, end: ts, input: 0, output: 0, cacheRead: 0, turns: [] }));
    s.start = Math.min(s.start, ts);
    s.end = Math.max(s.end, ts);
    if (typeof l.cwd === "string") s.cwd ||= l.cwd;
    const message = l.message as { id?: unknown; usage?: Record<string, unknown> } | undefined;
    const u = message?.usage;
    if (l.type !== "assistant" || !u) continue;
    if (message.id !== undefined) {
      const key = `${String(message.id)}:${String(l.requestId)}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const input = num(u.input_tokens) + num(u.cache_creation_input_tokens), output = num(u.output_tokens), cacheRead = num(u.cache_read_input_tokens);
    s.input += input;
    s.output += output;
    s.cacheRead += cacheRead;
    s.turns.push([ts, input + output + cacheRead]);
  }
  return sessions.size ? [...sessions.values()] : null;
};
