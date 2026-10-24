import { expect, test } from "vitest";
import type { AgentInfo, Board, ConsoleNode } from "@agentboard/shared";
import { snapshot } from "../../src/command/snapshot.js";

const con = (id: string, extra: Partial<ConsoleNode> = {}): ConsoleNode => ({
  id, type: "console", title: id, x: 0, y: 0, w: 1, h: 1, agent: "claude", cwd: "/r", status: "idle",
  createdAt: "2026-01-01T00:00:00.000Z", lastActiveAt: "2026-01-01T00:01:00.000Z", ...extra,
});

test("snapshot lists consoles from every workspace with branch and idleSeconds", () => {
  const board = {
    repoPath: "/r", activeWorkspaceId: "w1",
    workspaces: [
      { id: "w1", name: "main", nodes: [con("a", { worktree: { path: "/r/wt", branch: "fix/x", base: "main" } as never })] },
      { id: "w2", name: "other", nodes: [con("b"), { id: "n", type: "note" } as never] },
    ],
  } as Board;
  const agents: AgentInfo[] = [{ id: "claude", command: "claude", version: null, available: true }];
  const now = Date.parse("2026-01-01T00:03:00.500Z");
  const s = snapshot(board, agents, now);
  expect(s).toMatchObject({ repoPath: "/r", activeWorkspaceId: "w1", agents, workspaces: [{ id: "w1", name: "main" }, { id: "w2", name: "other" }] });
  expect(s.consoles).toMatchObject([
    { id: "a", workspaceId: "w1", branch: "fix/x", idleSeconds: 120 },
    { id: "b", workspaceId: "w2", idleSeconds: 120 },
  ]);
  expect(s.consoles[1]!.branch).toBeUndefined();
});
