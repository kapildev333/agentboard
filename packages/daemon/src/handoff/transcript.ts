import { readdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import type { ConsoleNode } from "@agentboard/shared";

export type Turn = { role: "user" | "assistant" | "tool"; text: string; tool?: { name: string; files?: string[] } };
/** home: the user's home the agents keep their logs under; replay: the console's PTY ring buffer. */
export type TranscriptDeps = { home: string; replay: (consoleId: string) => string };

type Block = { type?: string; text?: string; name?: string; input?: Record<string, unknown>; content?: unknown };

// CSI and OSC sequences and the two-byte escapes, so the brief reads as plain text.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
const EDITS = new Set(["Edit", "Write", "MultiEdit"]);
const textOf = (c: unknown): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((b: Block) => (typeof b === "string" ? b : (b.text ?? ""))).join("\n") : "";

/** Each JSON line as turns: `{type, message: {content}}` as claude writes it, or a codex `{payload: {role, content}}`. */
function parseJsonl(text: string, cwd: string, home: string): Turn[] {
  // A path inside the console's cwd is shown relative to it, one elsewhere under the home with ~, so no home path leaks.
  const short = (p: string) => (p.startsWith(cwd + sep) ? p.slice(cwd.length + 1) : home && p.startsWith(home + sep) ? `~${p.slice(home.length)}` : p);
  const turns: Turn[] = [];
  for (const line of text.split("\n")) {
    let j: { type?: string; message?: { role?: string; content?: unknown }; payload?: { role?: string; content?: unknown } };
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    const m = j.message ?? j.payload;
    const role = m?.role ?? j.type;
    if (!m || (role !== "user" && role !== "assistant")) continue;
    if (!Array.isArray(m.content)) {
      if (textOf(m.content)) turns.push({ role, text: textOf(m.content) });
      continue;
    }
    for (const b of m.content as Block[]) {
      if (b.type === "tool_use" && b.name) {
        const file = b.input?.file_path;
        if (EDITS.has(b.name) && typeof file === "string") turns.push({ role: "tool", text: "", tool: { name: b.name, files: [short(file)] } });
        else turns.push({ role: "tool", text: typeof b.input?.command === "string" ? b.input.command : "", tool: { name: b.name } });
      } else if (b.type === "tool_result") turns.push({ role: "tool", text: textOf(b.content) });
      else if (b.text) turns.push({ role, text: b.text });
    }
  }
  return turns;
}

const readers: Partial<Record<ConsoleNode["agent"], (node: ConsoleNode, sessionId: string, home: string) => Promise<string>>> = {
  // claude 2.x: ~/.claude/projects/<cwd, every non-alphanumeric as "-">/<session id>.jsonl; lines of {type: user | assistant,
  // message: {content: string | [text | tool_use {name, input} | tool_result {content}]}}.
  claude: (node, id, home) => readFile(join(home, ".claude", "projects", node.cwd.replace(/[^a-zA-Z0-9]/g, "-"), `${id}.jsonl`), "utf8"),
  // codex 0.4x, best effort: ~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-<ts>-<session id>.jsonl; read with the claude
  // shape, plus {payload: {role, content}} lines whose text blocks are input_text and output_text.
  codex: async (_node, id, home) => {
    const root = join(home, ".codex", "sessions");
    const file = (await readdir(root, { recursive: true })).find((f) => f.endsWith(".jsonl") && f.includes(id));
    if (!file) throw new Error("no codex session file");
    return readFile(join(root, file), "utf8");
  },
  // gemini and opencode keep their sessions in stores whose layout was not checked; they use the ring buffer below.
};

/** The console's conversation as turns; any miss falls back to the last 50 lines of its PTY output as one assistant turn. */
export async function readTranscript(node: ConsoleNode, deps: TranscriptDeps): Promise<Turn[]> {
  const read = node.session && readers[node.agent];
  if (read) {
    const turns = await read(node, node.session!.id, deps.home).then((t) => parseJsonl(t, node.cwd, deps.home), () => []);
    if (turns.length) return turns;
  }
  let out = "";
  try {
    out = deps.replay(node.id);
  } catch {
    // no PTY for a stopped console: nothing to read
  }
  const lines = out.replace(ANSI, "").split(/\r?\n/).map((l) => l.replace(/\r/g, "")).slice(-50);
  return lines.join("").trim() ? [{ role: "assistant", text: lines.join("\n") }] : [];
}
