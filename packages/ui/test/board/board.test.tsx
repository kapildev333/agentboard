import { useEffect } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { autosaveBoard } from "../../src/board/store";
import type { Board as BoardData, BoardNode } from "@agentboard/shared";
import { Board, useBoard } from "../../src/board";

type Fn = (...a: never[]) => void;
type Props = Record<string, unknown> & { nodes: unknown[] } & Record<"onNodeDragStop" | "onMoveEnd" | "onNodesChange", Fn>;
const seen = vi.hoisted(() => ({
  props: undefined as unknown as Props,
  resizer: undefined as unknown as { onResizeEnd: (e: unknown, p: unknown) => void },
  mounts: 0,
  renders: [] as string[][],
}));
vi.mock("@xyflow/react", async (orig) => {
  const mod = await orig<typeof import("@xyflow/react")>();
  return {
    ...mod,
    NodeResizer: (p: typeof seen.resizer) => {
      seen.resizer = p;
      return null;
    },
    ReactFlow: (p: Props) => {
      seen.props = p;
      seen.renders.push((p.nodes as { id: string }[]).map((n) => n.id));
      useEffect(() => void seen.mounts++, []);
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
    { id: "b", name: "B", viewport: { x: 5, y: 6, zoom: 1.5 }, nodes: [note("nb")] },
  ],
});

const NoteView = () => <div>note</div>;
const nodeTypes = { note: NoteView };

beforeEach(() => {
  seen.mounts = 0;
  seen.renders = [];
  useBoard.getState().setBoard(board());
});
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
    expect(seen.props).toMatchObject({ minZoom: 0.25, maxZoom: 2, panOnScroll: true });
  });
});


describe("Board wiring", () => {
  it("renders the minimap and the fit-view control", () => {
    const { container } = render(<Board nodeTypes={nodeTypes} />);
    expect(container.querySelector(".react-flow__minimap")).toBeTruthy();
    expect(screen.getByRole("button", { name: /fit view/i })).toBeTruthy();
  });

  it("remounts the canvas per workspace", () => {
    render(<Board nodeTypes={nodeTypes} />);
    expect(seen.mounts).toBe(1);
    act(() => useBoard.getState().switchWorkspace("b"));
    expect(seen.mounts).toBe(2);
  });

  it("the canvas gets the active workspace's viewport and never renders the old nodes after a switch", () => {
    useBoard.getState().addNode(note("na"));
    render(<Board nodeTypes={nodeTypes} />);
    expect(seen.props.defaultViewport).toEqual({ x: 0, y: 0, zoom: 1 });
    seen.renders = [];
    act(() => useBoard.getState().switchWorkspace("b"));
    expect(seen.props.defaultViewport).toEqual({ x: 5, y: 6, zoom: 1.5 });
    expect(seen.renders.flat()).not.toContain("na");
  });

  it("keyboard moves and deletes reach the store", () => {
    useBoard.getState().addNode(note("n1"));
    useBoard.getState().addNode(note("n2"));
    render(<Board nodeTypes={nodeTypes} />);
    const change = seen.props.onNodesChange as (c: unknown) => void;
    act(() => change([{ type: "position", id: "n1", position: { x: 7, y: 8 }, dragging: false }]));
    act(() => change([{ type: "position", id: "n2", position: { x: 99, y: 99 }, dragging: true }]));
    act(() => change([{ type: "remove", id: "n2" }]));
    expect(useBoard.getState().board.workspaces[0]!.nodes).toMatchObject([{ id: "n1", x: 7, y: 8 }]);
  });

  it("a top-left resize keeps its new width mid-gesture", () => {
    useBoard.getState().addNode(note("n1"));
    render(<Board nodeTypes={nodeTypes} />);
    act(() =>
      (seen.props.onNodesChange as (c: unknown) => void)([
        { type: "dimensions", id: "n1", dimensions: { width: 300, height: 100 }, resizing: true, setAttributes: true },
        { type: "position", id: "n1", position: { x: -100, y: 0 } },
      ]),
    );
    expect(seen.props.nodes[0]).toMatchObject({ width: 300, position: { x: -100, y: 0 } });
    expect(useBoard.getState().board.workspaces[0]!.nodes[0]).toMatchObject({ w: 200, x: 0 });
  });

  it("move end writes the viewport", () => {
    render(<Board nodeTypes={nodeTypes} />);
    act(() => (seen.props.onMoveEnd as (...a: unknown[]) => void)(null, { x: 1, y: 2, zoom: 1.5 }));
    expect(useBoard.getState().board.workspaces[0]!.viewport).toEqual({ x: 1, y: 2, zoom: 1.5 });
  });

  it("resize end writes size and origin", () => {
    useBoard.getState().addNode(note("n1"));
    render(<Board nodeTypes={nodeTypes} />);
    act(() => seen.resizer.onResizeEnd({}, { x: 5, y: 6, width: 300, height: 150 }));
    expect(useBoard.getState().board.workspaces[0]!.nodes[0]).toMatchObject({ x: 5, y: 6, w: 300, h: 150 });
  });

  it("selection survives a store update", async () => {
    useBoard.getState().addNode(note("n1"));
    render(<Board nodeTypes={nodeTypes} />);
    act(() => (seen.props.onNodesChange as (c: unknown) => void)([{ type: "select", id: "n1", selected: true }]));
    act(() => useBoard.getState().moveNode("n1", 50, 50));
    expect((await screen.findByTestId("node-n1")).closest(".react-flow__node")!.classList).toContain("selected");
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

  it("resizeNode and removeNode edit the active workspace", () => {
    const s = useBoard.getState();
    s.addNode(note("n1"));
    s.addNode(note("n2"));
    s.resizeNode("n1", 400, 300);
    s.removeNode("n2");
    expect(useBoard.getState().board.workspaces[0]!.nodes).toMatchObject([{ id: "n1", w: 400, h: 300 }]);
  });

  it("each workspace keeps its own viewport", () => {
    const s = useBoard.getState();
    s.setViewport({ x: 1, y: 2, zoom: 1.5 });
    s.switchWorkspace("b");
    s.setViewport({ x: 9, y: 9, zoom: 0.5 });
    s.switchWorkspace("a");
    const vp = (id: string) => useBoard.getState().board.workspaces.find((w) => w.id === id)!.viewport;
    expect(vp("a")).toEqual({ x: 1, y: 2, zoom: 1.5 });
    expect(vp("b")).toEqual({ x: 9, y: 9, zoom: 0.5 });
  });

  it("setBoard is not saved, and cancels a pending save", () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const stop = autosaveBoard(save);
    useBoard.getState().moveNode("nb", 1, 1);
    useBoard.getState().setBoard(board());
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
    stop();
    vi.useRealTimers();
  });
});
