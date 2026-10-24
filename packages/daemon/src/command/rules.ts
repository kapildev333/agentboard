import { randomUUID } from "node:crypto";
import { stepAsks, summarise } from "@agentboard/shared";
import type { AgentId, BoardSnapshot, PlanStep, SnapshotConsole } from "@agentboard/shared";

/** A step before planCommand gives it an id, a summary and its asks flag. */
export type Draft<S = PlanStep> = S extends PlanStep ? Omit<S, "id" | "summary" | "asks"> & { detail?: string } : never;

/** D45, D48: ids are always fresh, asks always comes from the kind, summary from the shared one-liner. */
export function complete(draft: Draft, snapshot: BoardSnapshot): PlanStep {
  const step = { ...draft, id: randomUUID(), summary: "", asks: stepAsks(draft.kind) } as PlanStep;
  return { ...step, summary: summarise(step, snapshot) };
}

const AGENTS: AgentId[] = ["claude", "codex", "gemini", "opencode"];
const COUNTS: Record<string, number> = { two: 2, both: 2, three: 3, four: 4, five: 5, six: 6 };
const STATUS: [RegExp, SnapshotConsole["status"]][] = [
  [/\b(idle)\b/, "idle"],
  [/\b(needs? (me|you|input)|waiting|blocked)\b/, "needs_you"],
  [/\b(stopped|paused)\b/, "stopped"],
  [/\b(exited|dead|finished|crashed)\b/, "exited"],
  [/\b(working|busy|running)\b/, "working"],
];
const FILLER = /\b(the|my|a|an|that|which|of|them|it|console|consoles|terminal|terminals|session|sessions|one|ones|on)\b/g;
const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** Consoles a phrase refers to: "all", a status, an agent, an optional count, else the best title match. */
function resolve(ref: string, snapshot: BoardSnapshot): SnapshotConsole[] {
  const r = ref.toLowerCase();
  const all = /\b(all|every|everything)\b/.test(r);
  const status = STATUS.find(([re]) => re.test(r))?.[1];
  const agent = (AGENTS as string[]).concat("custom").find((a) => new RegExp(`\\b${a}\\b`).test(r));
  if (all || status || agent) {
    const list = snapshot.consoles.filter((c) => (!status || c.status === status) && (!agent || c.agent === agent));
    const count = words(r).map((w) => COUNTS[w] ?? Number(w)).find((n) => Number.isInteger(n) && n > 0);
    return count && count !== list.length ? [] : list;
  }
  const want = words(r.replace(FILLER, " ")).join(" ");
  if (!want) return [];
  const score = (c: SnapshotConsole) => {
    const t = c.title.toLowerCase();
    if (t === want) return 3;
    if (t.startsWith(want)) return 2;
    return words(want).every((w) => words(t).includes(w)) ? 1 : 0;
  };
  const best = snapshot.consoles.reduce<[SnapshotConsole | undefined, number]>(
    (acc, c) => (score(c) > acc[1] ? [c, score(c)] : acc),
    [undefined, 0],
  )[0];
  return best ? [best] : [];
}

const STOP = new Set(["fix", "the", "a", "an", "to", "of", "in", "on", "for", "and", "our", "my", "this", "that"]);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function spawn(clause: string, rest: string, snapshot: BoardSnapshot, quotes: string[]): Draft | undefined {
  let head = rest;
  let near: string | undefined;
  const nearM = head.match(/^(.*?)\s+(?:next to|beside)\s+(.+)$/i);
  if (nearM) [head, near] = [nearM[1]!, resolve(nearM[2]!, snapshot)[0]?.id];
  let prompt: string | undefined;
  const quoted = head.match(/\u0001(\d+)\u0001/);
  if (quoted) {
    prompt = quotes[Number(quoted[1])];
    head = head.replace(quoted[0], " ");
  } else {
    const toM = head.match(/^(.*?)\s+to\s+(.+)$/i);
    if (toM) [head, prompt] = [toM[1]!, toM[2]!];
  }
  const h = head.toLowerCase();
  const agent = AGENTS.find((a) => new RegExp(`\\b${a}\\b`).test(h));
  if (!agent) return undefined;
  let worktree: string | undefined;
  const named = h.match(/\b(?:worktree|branch)\s+(?:called\s+|named\s+)?(?!from\b)([\w./-]+)/);
  if (named) worktree = named[1];
  else if (/\bworktree\b/.test(h)) {
    const name = slug(words(prompt ?? "").slice(0, 6).filter((w) => !STOP.has(w.toLowerCase())).join(" "));
    worktree = `${/\bfix(es|ing)?\b/i.test(clause) ? "fix/" : ""}${name || `${agent}-${randomUUID().slice(0, 8)}`}`;
  }
  const base = worktree && h.match(/\bfrom\s+([\w./-]+)/)?.[1];
  const missing = !snapshot.agents.some((a) => a.id === agent && a.available);
  const detail = [base && `From ${base}.`, missing && `${agent} is not available on this machine.`].filter(Boolean).join(" ");
  return {
    kind: "spawn",
    agent,
    ...(worktree && { worktree }),
    ...(prompt && { prompt }),
    ...(near && { near }),
    ...(detail && { detail }),
  };
}

/** One clause, one intent; anything it does not understand gives no step. */
function parseClause(clause: string, snapshot: BoardSnapshot, quotes: string[]): Draft[] {
  const unquote = (s: string) => s.replace(/\u0001(\d+)\u0001/g, (_, i: string) => quotes[Number(i)] ?? "").trim();
  let m: RegExpMatchArray | null;
  if (/^(fit|show everything|show all|zoom to fit)\b/i.test(clause)) return [{ kind: "fit" }];
  if ((m = clause.match(/^(?:add\s+(?:a\s+)?note|note(?:\s+down)?|write\s+(?:a\s+)?note)\s+(?:saying\s+|that\s+)?(.+)$/i)))
    return [{ kind: "note", text: unquote(m[1]!) }];
  if ((m = clause.match(/^(?:tell|ask)\s+(.+?)\s+to\s+(.+)$/i)) || (m = clause.match(/^type\s+(.+)\s+into\s+(.+)$/i))) {
    const [ref, text] = /^type/i.test(clause) ? [m[2]!, m[1]!] : [m[1]!, m[2]!];
    const c = resolve(ref, snapshot)[0];
    return c ? [{ kind: "input", consoleId: c.id, text: unquote(text) }] : [];
  }
  if ((m = clause.match(/^(?:spawn|start|open|launch|new)\s+(.+)$/i))) {
    const draft = spawn(clause, m[1]!, snapshot, quotes);
    if (draft) return [draft];
  }
  if ((m = clause.match(/^(?:close|kill|stop|shut down|remove)\s+(.+)$/i))) {
    const ids = resolve(m[1]!, snapshot).map((c) => c.id);
    return ids.length ? [{ kind: "close", consoleIds: ids }] : [];
  }
  if ((m = clause.match(/^(?:resume|restart|wake up|wake|continue)\s+(.+)$/i)))
    return resolve(m[1]!, snapshot).map((c) => ({ kind: "resume", consoleId: c.id }));
  if ((m = clause.match(/^(?:focus on|focus|show me|show|go to|jump to|switch to|open)\s+(.+)$/i))) {
    const c = resolve(m[1]!, snapshot)[0];
    return c ? [{ kind: "focus", consoleId: c.id }] : [];
  }
  return [];
}

const VERB = /^(fit|show me|show|note|add|write|tell|ask|type|spawn|start|open|launch|new|close|kill|stop|shut down|remove|resume|restart|wake up|wake|continue|focus on|focus|go to|jump to|switch to|zoom)\b/i;
const PAYLOAD = /^(note|add|write|tell|ask|type|spawn|start|open|launch|new)$/i;

/** Split on "and", "then" and commas; a clause with no verb borrows the one before ("close A and B"), or rejoins a prompt or note it was cut from. */
function clauses(text: string): string[] {
  const out: string[] = [];
  let verb = "";
  for (const raw of text.split(/,|;|\band\b|\bthen\b/i)) {
    const c = raw.replace(/[.!?:]+(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
    if (!c) continue;
    const v = c.match(VERB)?.[1];
    if (v) {
      verb = v;
      out.push(c);
    } else if (!verb) out.push(c);
    else if (/^(next to|beside)\b/i.test(c)) out[out.length - 1] += ` ${c}`;
    else if (PAYLOAD.test(verb)) out[out.length - 1] += ` and ${c}`;
    else out.push(`${verb} ${c}`);
  }
  return out;
}

export function parseRules(text: string, snapshot: BoardSnapshot): PlanStep[] {
  const quotes: string[] = [];
  const masked = text.replace(/["“”]([^"“”]*)["“”]/g, (_, q: string) => `\u0001${quotes.push(q) - 1}\u0001`);
  const drafts: Draft[] = [];
  for (const c of clauses(masked)) {
    for (const d of parseClause(c, snapshot, quotes)) {
      const prev = drafts.at(-1);
      if (d.kind === "close" && prev?.kind === "close") prev.consoleIds = [...new Set([...prev.consoleIds, ...d.consoleIds])];
      else drafts.push(d);
    }
  }
  return drafts.map((d) => complete(d, snapshot));
}
