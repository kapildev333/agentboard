// OpenCode: <root>/storage/message/<sessionID>/<messageID>.json and <root>/storage/session/<projectID>/<sessionID>.json,
// root ~/.local/share/opencode (or <XDG_DATA_HOME>/opencode), file layout of the 0.x releases (not run here: CLAUDE.md
// forbids running third-party agents). A message is {sessionID, role, time.{created, completed}}; an assistant one adds
// tokens.{input, output, cache.{read, write}} and path.cwd, input excluding the cache. A session is {id, directory,
// time.{created, updated}}. Times are epoch ms. Each file is one part of a session; the report merges them.
import { num, type Parse, type Session } from "./index.js";

type Doc = {
  id?: unknown; sessionID?: unknown; role?: unknown; directory?: unknown;
  time?: { created?: unknown; completed?: unknown; updated?: unknown };
  tokens?: { input?: unknown; output?: unknown; cache?: { read?: unknown; write?: unknown } };
  path?: { cwd?: unknown };
};

export const parseOpencode: Parse = (text) => {
  let d: Doc;
  try {
    d = JSON.parse(text) as Doc;
  } catch {
    return null;
  }
  const created = d?.time?.created;
  if (typeof created !== "number") return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  if (typeof d.sessionID === "string" && typeof d.role === "string") {
    const end = typeof d.time!.completed === "number" ? d.time!.completed : created;
    const s: Session = { agent: "opencode", id: d.sessionID, cwd: str(d.path?.cwd), start: created, end, input: 0, output: 0, cacheRead: 0, turns: [] };
    if (d.role === "assistant" && d.tokens) {
      s.input = num(d.tokens.input) + num(d.tokens.cache?.write);
      s.output = num(d.tokens.output);
      s.cacheRead = num(d.tokens.cache?.read);
      s.turns.push([created, s.input + s.output + s.cacheRead]);
    }
    return [s];
  }
  if (typeof d.id === "string" && typeof d.directory === "string") {
    const end = typeof d.time!.updated === "number" ? d.time!.updated : created;
    return [{ agent: "opencode", id: d.id, cwd: d.directory, start: created, end, input: 0, output: 0, cacheRead: 0, turns: [] }];
  }
  return null;
};
