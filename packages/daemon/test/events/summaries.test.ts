import { expect, test } from "vitest";
import type { Board, ConsoleNode } from "@agentboard/shared";
import { ConsoleSummaries } from "../../src/events/index.js";

const node = (id: string): ConsoleNode => ({
  id, type: "console", title: id, x: 0, y: 0, w: 1, h: 1, agent: "claude", cwd: "/r", status: "working",
  createdAt: "2026-10-24T00:00:00.000Z", lastActiveAt: "2026-10-24T00:00:00.000Z",
});
const board = (nodes: ConsoleNode[], teams: unknown[] = []) =>
  ({ repoPath: "/r", workspaces: [{ id: "w", nodes, teams }] }) as unknown as Board;

test("ANSI-coloured output gives a plain lastLine", () => {
  const s = new ConsoleSummaries();
  s.feed("a", "\x1b[32mbuilding\x1b[0m\r\n\x1b[2K\x1b[1G  tests pass \r\n\r\n");
  expect(s.summarise(board([node("a")]))[0]).toMatchObject({ id: "a", lastLine: "tests pass", repoPath: "/r" });
  s.feed("a", "x".repeat(300));
  expect(s.summarise(board([node("a")]))[0]!.lastLine).toHaveLength(200);
});

test("a console in a team carries its teamId and role", () => {
  const s = new ConsoleSummaries();
  s.setLoop("a", "loop1");
  const teams = [{ id: "t1", name: "T", roles: [{ name: "Reviewer", consoleId: "a", order: 0 }] }];
  const [sum, other] = s.summarise(board([node("a"), node("b")], teams));
  expect(sum).toMatchObject({ teamId: "t1", role: "Reviewer", loopId: "loop1", lastLine: "" });
  expect(other!.teamId).toBeUndefined();
});
