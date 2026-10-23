import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { autosaveBoard } from "../../src/board/store";
import type { Board as BoardData, BoardNode } from "@agentboard/shared";
import { Board, useBoard } from "../../src/board";

const seen = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));
vi.mock("@xyflow/react", async (orig) => {
  const mod = await orig<typeof import("@xyflow/react")>();
  return {
    ...mod,
    ReactFlow: (p: Record<string, unknown>) => {
      seen.props = p;
      return <mod.ReactFlow {...(p as object)} />;
    },
  };
});

beforeAll(() => {
  // React Flow measures nodes with ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.DOMMatrixReadOnly ??= class {
    m22 = 1;
  } as never;
});

const note = (id: string, x = 0, y = 0): BoardNode => ({ id, type: "note", title: id, x, y, w: 200, h: 100, text: "hi" });
const board = (): BoardData => ({
  version: 1,
  repoPath: "/r",
  activeWorkspaceId: "a",
  workspaces: [
    { id: "a", name: "A", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] },
    { id: "b", name: "B", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [note("nb")] },
  ],
});

const NoteView = () => <div>note</div>;
const nodeTypes = { note: NoteView };

beforeEach(() => useBoard.getState().setBoard(board()));
afterEach(cleanup);

describe("Board", () => {
  it("adding a node renders it", async () => {
    render(<Board nodeTypes={nodeTypes} />);
    act(() => useBoard.getState().addNode(note("n1")));
    expect(await screen.findByTestId("node-n1")).toBeTruthy();
  });

  it("switching workspace swaps the nodes", async () => {
    render(<Board nodeTypes={nodeTypes} />);
    expect(screen.queryByTestId("node-nb")).toBeNull();
    act(() => useBoard.getState().switchWorkspace("b"));
    expect(await screen.findByTestId("node-nb")).toBeTruthy();
  });

  it("the zoom bounds are 0.25 and 2", () => {
    render(<Board nodeTypes={nodeTypes} />);
    expect(seen.props).toMatchObject({ minZoom: 0.25, maxZoom: 2 });
  });
});

describe("store", () => {
  it("save is called once 500 ms after a burst of moves", () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const stop = autosaveBoard(save);
    const s = useBoard.getState();
    s.switchWorkspace("b");
    for (let i = 1; i <= 5; i++) s.moveNode("nb", i, i);
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].workspaces[1].nodes[0]).toMatchObject({ x: 5, y: 5 });
    stop();
    vi.useRealTimers();
  });

  it("the last workspace cannot be deleted", () => {
    const s = useBoard.getState();
    s.deleteWorkspace("a");
    expect(useBoard.getState().board.workspaces.map((w) => w.id)).toEqual(["b"]);
    expect(useBoard.getState().board.activeWorkspaceId).toBe("b");
    s.deleteWorkspace("b");
    expect(useBoard.getState().board.workspaces).toHaveLength(1);
  });
});
