import { expect, test, vi } from "vitest";
import type { Board } from "@agentboard/shared";
import { mergeDaemonBoard } from "../../src/app";
import { useBoard } from "../../src/board";

vi.mock("../../src/console", () => ({ ConsoleNode: () => null }));

const board = (studio?: Board["studio"]): Board => ({
  version: 1,
  rev: 1,
  repoPath: "/r",
  activeWorkspaceId: "main",
  workspaces: [{ id: "main", name: "main", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] }],
  ...(studio && { studio }),
});

test("pins set in another tab are folded in and leave nothing to save", () => {
  useBoard.getState().setBoard(board());
  mergeDaemonBoard({ ...board({ pins: ["src/a.ts"], document: "docs/x.md" }), rev: 2 }, new Set());
  const { board: now, loaded } = useBoard.getState();
  expect(now.studio).toEqual({ pins: ["src/a.ts"], document: "docs/x.md" });
  expect(now).toBe(loaded);
});

test("this tab's unsaved studio change wins over the daemon's", () => {
  useBoard.getState().setBoard(board({ pins: [] }));
  useBoard.setState({ board: { ...useBoard.getState().board, studio: { pins: ["mine.ts"] } } });
  mergeDaemonBoard({ ...board({ pins: ["theirs.ts"] }), rev: 2 }, new Set());
  expect(useBoard.getState().board.studio).toEqual({ pins: ["mine.ts"] });
  expect(useBoard.getState().loaded.studio).toEqual({ pins: ["theirs.ts"] });
});
