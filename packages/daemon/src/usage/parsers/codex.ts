// Codex CLI rollouts: <root>/YYYY/MM/DD/rollout-*.jsonl, root ~/.codex/sessions (or <CODEX_HOME>/sessions), format of the
// 0.4x releases (not run here: CLAUDE.md forbids running third-party agents). The session_meta line gives payload.{id, cwd}
// and the start; event_msg lines with payload.type "token_count" carry a running payload.info.total_token_usage.
// {input_tokens, cached_input_tokens, output_tokens}, where input_tokens includes the cached part. The last total is the
// session's; each increase over the previous total is one turn, so a repeated event adds nothing.
import { lines, num, time, type Parse, type Session } from "./index.js";

export const parseCodex: Parse = (text) => {
  let s: Session | undefined;
  let last = 0;
  for (const l of lines(text)) {
    const p = l.payload as Record<string, unknown> | undefined;
    const ts = time(l.timestamp);
    if (!p || Number.isNaN(ts)) continue;
    if (l.type === "session_meta" && typeof p.id === "string") {
      s = { agent: "codex", id: p.id, cwd: typeof p.cwd === "string" ? p.cwd : "", start: ts, end: ts, input: 0, output: 0, cacheRead: 0, turns: [] };
      continue;
    }
    if (!s) continue;
    s.end = Math.max(s.end, ts);
    const total = l.type === "event_msg" && p.type === "token_count" && (p.info as { total_token_usage?: Record<string, unknown> } | null)?.total_token_usage;
    if (!total) continue;
    const cached = num(total.cached_input_tokens);
    s.input = num(total.input_tokens) - cached;
    s.cacheRead = cached;
    s.output = num(total.output_tokens);
    const sum = s.input + s.output + s.cacheRead;
    if (sum > last) s.turns.push([ts, sum - last]);
    last = sum;
  }
  return s ? [s] : null;
};
