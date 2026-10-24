import { expect, test } from "vitest";
import type { BoardEvent as Event, ConsoleNode } from "@agentboard/shared";
import type { Session } from "../../src/usage/parsers/index.js";
import { report, toCsv } from "../../src/usage/report.js";

// Local times, so day keys match the machine's calendar whatever its zone.
const now = new Date(2026, 9, 24, 12, 0);
const at = (daysAgo: number, h: number, m = 0) => new Date(2026, 9, 24 - daysAgo, h, m).getTime();
const session = (agent: Session["agent"], id: string, cwd: string, start: number, min: number, input: number, output: number, cacheRead = 0): Session =>
  ({ agent, id, cwd, start, end: start + min * 60_000, input, output, cacheRead, turns: [[start, input + output + cacheRead]] });
const sessions: Session[] = [
  session("claude", "s1", "/work/demo/shop", at(0, 9), 30, 100, 10, 1000),
  // The second part of s1 from another file: merged by agent and id, not a second session.
  { ...session("claude", "s1", "", at(0, 9, 40), 10, 50, 5), turns: [[at(0, 9, 45), 55]] },
  session("claude", "s2", "/work/demo/api", at(3, 14), 10, 20, 2),
  session("codex", "s3", "/work/demo/api", at(13, 8), 50, 300, 30, 200),
  // 14 days ago is outside 14d, which ends today.
  session("codex", "s4", "/work/demo/api", at(14, 8), 5, 9999, 9999),
];
const sources = [{ agent: "claude" as const, path: "~/.claude/projects", files: 2 }];
const node = (id: string, title: string, sessionId: string): ConsoleNode => ({
  id, type: "console", title, x: 0, y: 0, w: 1, h: 1, agent: "claude", cwd: "/work/demo/shop",
  session: { provider: "claude", id: sessionId }, status: "idle", createdAt: "", lastActiveAt: "",
});

test("14d groups by agent and byDay has 14 entries", () => {
  const r = report({ range: "14d", group: "agent" }, { sessions, sources, consoles: [], now });
  expect(r.range).toBe("14d");
  expect(r.byDay).toHaveLength(14);
  expect(r.byDay[13]).toEqual({ day: "2026-10-24", byAgent: { claude: 1165 } });
  expect(r.byDay[10]).toEqual({ day: "2026-10-21", byAgent: { claude: 22 } });
  expect(r.byDay[0]).toEqual({ day: "2026-10-11", byAgent: { codex: 530 } });
  expect(r.totals).toEqual({ input: 470, output: 47, cacheRead: 1200, sessions: 3, medianSessionMin: 50, needsYouWaitSec: 0 });
  expect(r.groups).toEqual([
    { key: "claude", label: "claude", agent: "claude", sessions: 2, input: 170, output: 17, cacheRead: 1000 },
    { key: "codex", label: "codex", agent: "codex", sessions: 1, input: 300, output: 30, cacheRead: 200 },
  ]);
  expect(r.sources).toEqual(sources);
  expect(r.checkedAt).toBe(now.toISOString());
});

test("group by console matches a board session id", () => {
  const r = report({ range: "14d", group: "console" }, { sessions, sources, consoles: [node("c1", "Checkout flow", "s1")], now });
  expect(r.groups).toEqual([
    { key: "c1", label: "Checkout flow", agent: "claude", sessions: 1, input: 150, output: 15, cacheRead: 1000 },
    { key: "other", label: "Not on the board", sessions: 2, input: 320, output: 32, cacheRead: 200 },
  ]);
});

test("group by repo uses the session's cwd", () => {
  const r = report({ range: "today", group: "repo" }, { sessions, sources, consoles: [], now });
  expect(r.byDay).toEqual([{ day: "2026-10-24", byAgent: { claude: 1165 } }]);
  expect(r.groups).toEqual([{ key: "/work/demo/shop", label: "shop", sessions: 1, input: 150, output: 15, cacheRead: 1000 }]);
});

test("needs-you waits sum from status events, an open one up to now", () => {
  const ev = (consoleId: string, ts: number, status: Event["status"]): Event => ({ id: `${consoleId}${ts}`, ts: new Date(ts).toISOString(), kind: "status", consoleId, detail: "", status });
  const events = [ev("c1", at(0, 10), "needs_you"), ev("c1", at(0, 10, 2), "working"), ev("c2", at(0, 11, 59), "needs_you"), ev("c2", at(20, 1), "needs_you")];
  expect(report({ range: "14d", group: "agent" }, { sessions, sources, consoles: [], events, now }).totals.needsYouWaitSec).toBe(180);
});

test("csv: one line per group plus the header", () => {
  const csv = toCsv(report({ range: "14d", group: "console" }, { sessions, sources, consoles: [node("c1", 'Checkout, "v2"', "s1")], now }));
  expect(csv.trimEnd().split("\n")).toEqual([
    "key,label,agent,sessions,input,output,cacheRead",
    'c1,"Checkout, ""v2""",claude,1,150,15,1000',
    "other,Not on the board,,2,320,32,200",
  ]);
});
