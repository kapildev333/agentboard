import { basename } from "node:path";
import type { BoardEvent, ConsoleNode, UsageQuery, UsageReport } from "@agentboard/shared";
import type { Source } from "./cache.js";
import type { Session } from "./parsers/index.js";

export type ReportInput = {
  sessions: Session[];
  sources: Source[];
  /** Every console on the loaded boards, matched to sessions by session id. */
  consoles: ConsoleNode[];
  /** L42's event log; without it needs-you waits read 0. */
  events?: BoardEvent[];
  now?: Date;
};
type Group = UsageReport["groups"][number];

const DAYS = { today: 1, "14d": 14, "30d": 30 } as const;
const pad = (n: number) => String(n).padStart(2, "0");
/** The local calendar day, YYYY-MM-DD. */
const dayOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const tokens = (s: { input: number; output: number; cacheRead: number }) => s.input + s.output + s.cacheRead;
const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b), m = v.length >> 1;
  return v.length === 0 ? 0 : v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
};

/** Parts of one session from several files (opencode, gemini) as one session. */
export function mergeSessions(parts: Session[]): Session[] {
  const out = new Map<string, Session>();
  for (const p of parts) {
    const key = `${p.agent}:${p.id}`, s = out.get(key);
    if (!s) {
      out.set(key, { ...p, turns: [...p.turns] });
      continue;
    }
    s.start = Math.min(s.start, p.start);
    s.end = Math.max(s.end, p.end);
    s.cwd ||= p.cwd;
    s.input += p.input;
    s.output += p.output;
    s.cacheRead += p.cacheRead;
    s.turns.push(...p.turns);
  }
  return [...out.values()];
}

export function report(query: UsageQuery, { sessions: parts, sources, consoles, events = [], now = new Date() }: ReportInput): UsageReport {
  const all = mergeSessions(parts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const first = query.range === "all"
    ? new Date(all.reduce((m, s) => Math.min(m, s.start), today.getTime())).setHours(0, 0, 0, 0)
    : new Date(today.getFullYear(), today.getMonth(), today.getDate() - DAYS[query.range] + 1).getTime();
  const days: string[] = [];
  for (let d = new Date(first); d <= today; d.setDate(d.getDate() + 1)) days.push(dayOf(d.getTime()));
  const from = days[0]!, to = days[days.length - 1]!;
  // ponytail: a session counts on the day it started; a session past midnight puts all its tokens on its first day.
  const inRange = (ms: number) => dayOf(ms) >= from && dayOf(ms) <= to;
  const sessions = all.filter((s) => inRange(s.start));

  const byDay = new Map(days.map((day) => [day, {} as UsageReport["byDay"][number]["byAgent"]]));
  for (const s of sessions) {
    const b = byDay.get(dayOf(s.start))!;
    b[s.agent] = (b[s.agent] ?? 0) + tokens(s);
  }

  const bySession = new Map(consoles.filter((c) => c.session).map((c) => [`${c.session!.provider}:${c.session!.id}`, c]));
  const keyOf = (s: Session): Omit<Group, "sessions" | "input" | "output" | "cacheRead"> => {
    if (query.group === "agent") return { key: s.agent, label: s.agent, agent: s.agent };
    if (query.group === "repo") return { key: s.cwd, label: basename(s.cwd) || "Unknown folder" };
    const c = bySession.get(`${s.agent}:${s.id}`);
    return c ? { key: c.id, label: c.title, agent: c.agent } : { key: "other", label: "Not on the board" };
  };
  const groups = new Map<string, Group>();
  for (const s of sessions) {
    const k = keyOf(s);
    const g = groups.get(k.key) ?? { ...k, sessions: 0, input: 0, output: 0, cacheRead: 0 };
    g.sessions++;
    g.input += s.input;
    g.output += s.output;
    g.cacheRead += s.cacheRead;
    groups.set(k.key, g);
  }

  return {
    range: query.range,
    totals: {
      input: sessions.reduce((n, s) => n + s.input, 0),
      output: sessions.reduce((n, s) => n + s.output, 0),
      cacheRead: sessions.reduce((n, s) => n + s.cacheRead, 0),
      sessions: sessions.length,
      medianSessionMin: median(sessions.map((s) => (s.end - s.start) / 60_000)),
      needsYouWaitSec: needsYouWaitSec(events, inRange, now.getTime()),
    },
    byDay: days.map((day) => ({ day, byAgent: byDay.get(day)! })),
    groups: [...groups.values()].sort((a, b) => tokens(b) - tokens(a)),
    sources,
    checkedAt: now.toISOString(),
  };
}

/** From each needs_you status event to the console's next status event, or to now while it still waits. */
function needsYouWaitSec(events: BoardEvent[], inRange: (ms: number) => boolean, now: number): number {
  const open = new Map<string, number>();
  let ms = 0;
  const close = (id: string, at: number) => {
    const since = open.get(id);
    if (since !== undefined && inRange(since)) ms += at - since;
    open.delete(id);
  };
  const status = events.filter((e) => e.kind === "status" && e.consoleId && e.status).sort((a, b) => a.ts.localeCompare(b.ts));
  for (const e of status) {
    const at = Date.parse(e.ts);
    close(e.consoleId!, at);
    if (e.status === "needs_you") open.set(e.consoleId!, at);
  }
  for (const id of [...open.keys()]) close(id, now);
  return Math.round(ms / 1000);
}

const cell = (v: string | number) => (typeof v === "string" && /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));

/** One row per group under a header line. */
export function toCsv(r: UsageReport): string {
  const rows = [["key", "label", "agent", "sessions", "input", "output", "cacheRead"]];
  for (const g of r.groups) rows.push([g.key, g.label, g.agent ?? "", String(g.sessions), String(g.input), String(g.output), String(g.cacheRead)]);
  return rows.map((row) => row.map(cell).join(",")).join("\n") + "\n";
}
