// Gemini CLI: <root>/<project hash>/logs.json and <root>/<project hash>/chats/session-*.json, root ~/.gemini/tmp, format of
// the 0.x releases (not run here: CLAUDE.md forbids running third-party agents). logs.json is an array of user prompts
// {sessionId, timestamp} with no token counts, so it only bounds a session. A chat file is {sessionId, messages[]} where a
// message of type "gemini" carries timestamp and tokens.{input, output, cached}, input including the cached part.
// Neither file records the working directory, so gemini sessions group under an empty repo.
import { num, time, type Parse, type Session } from "./index.js";

const empty = (id: string, ts: number): Session => ({ agent: "gemini", id, cwd: "", start: ts, end: ts, input: 0, output: 0, cacheRead: 0, turns: [] });

export const parseGemini: Parse = (text) => {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  const sessions = new Map<string, Session>();
  const at = (id: unknown, ts: number) => {
    if (typeof id !== "string" || Number.isNaN(ts)) return undefined;
    let s = sessions.get(id);
    if (!s) sessions.set(id, (s = empty(id, ts)));
    s.start = Math.min(s.start, ts);
    s.end = Math.max(s.end, ts);
    return s;
  };
  if (Array.isArray(doc)) {
    for (const e of doc as Record<string, unknown>[]) at(e?.sessionId, time(e?.timestamp));
  } else if (doc && typeof doc === "object" && Array.isArray((doc as { messages?: unknown }).messages)) {
    const chat = doc as { sessionId?: unknown; messages: Record<string, unknown>[] };
    for (const m of chat.messages) {
      const s = at(chat.sessionId, time(m?.timestamp));
      const tk = m?.tokens as Record<string, unknown> | undefined;
      if (!s || m.type !== "gemini" || !tk) continue;
      const cached = num(tk.cached), input = num(tk.input) - cached, output = num(tk.output);
      s.input += input;
      s.output += output;
      s.cacheRead += cached;
      s.turns.push([time(m.timestamp), input + output + cached]);
    }
  }
  return sessions.size ? [...sessions.values()] : null;
};
