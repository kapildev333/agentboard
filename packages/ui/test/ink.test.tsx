import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import type { Board, Stroke } from "@agentboard/shared";
import { useBoard } from "../src/board";
import { InkLayer, InkToolbar } from "../src/ink";

beforeAll(() => {
  // jsdom has no PointerEvent, so fireEvent would drop clientX and clientY.
  globalThis.PointerEvent ??= class extends MouseEvent {} as typeof PointerEvent;
  // React Flow measures nodes with ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const stroke = (id: string, points: [number, number][], width = 4): Stroke => ({ id, points, color: "red", width });
const load = (ink?: Stroke[]) =>
  useBoard.getState().setBoard({
    version: 1,
    repoPath: "/r",
    activeWorkspaceId: "a",
    workspaces: [{ id: "a", name: "A", viewport: { x: 100, y: 50, zoom: 2 }, nodes: [], ink }],
  } as Board);
const ink = () => useBoard.getState().board.workspaces[0]!.ink ?? [];
const setup = () =>
  render(
    <ReactFlowProvider>
      <InkToolbar />
      <div style={{ width: 800, height: 600 }}>
        <ReactFlow nodes={[]} defaultViewport={{ x: 100, y: 50, zoom: 2 }} />
      </div>
      <InkLayer />
    </ReactFlowProvider>,
  );
const overlay = () => screen.getByTestId("ink-overlay");
const drag = (pts: [number, number][]) => {
  fireEvent.pointerDown(overlay(), { clientX: pts[0]![0], clientY: pts[0]![1], pointerId: 1 });
  for (const [x, y] of pts.slice(1)) fireEvent.pointerMove(overlay(), { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerUp(overlay(), { clientX: pts.at(-1)![0], clientY: pts.at(-1)![1], pointerId: 1 });
};

beforeEach(() => load());
afterEach(cleanup);

it("a pointer drag in pen mode adds one stroke with the pointer's flow coordinates", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Pen" }));
  drag([[120, 90], [121, 91], [140, 130]]); // the second point is under 2 flow units from the first
  expect(ink()).toHaveLength(1);
  expect(ink()[0]!.points).toEqual([[10, 20], [20, 40]]);
  expect(ink()[0]!.width).toBe(4);
  expect(ink()[0]!.id).toBeTruthy();
});

it("the eraser removes a stroke it crosses", () => {
  load([stroke("s1", [[0, 0], [100, 0]]), stroke("s2", [[0, 200], [100, 200]])]);
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Eraser" }));
  drag([[100, 50 + 4], [100, 50 - 4]]); // flow (0,2) to (0,-2): across s1 only
  expect(ink().map((s) => s.id)).toEqual(["s2"]);
});

it("Escape leaves ink mode unless a terminal has focus", () => {
  setup();
  const pen = () => screen.getByRole("button", { name: "Pen" });
  fireEvent.click(pen());
  const term = document.body.appendChild(document.createElement("div"));
  term.className = "xterm";
  const ta = term.appendChild(document.createElement("textarea"));
  ta.focus();
  fireEvent.keyDown(ta, { key: "Escape" });
  expect(pen().getAttribute("aria-pressed")).toBe("true");
  ta.blur();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(pen().getAttribute("aria-pressed")).toBe("false");
  expect(screen.queryByTestId("ink-overlay")).toBeNull();
  term.remove();
});

it("renders one path per stroke and Done leaves ink mode", () => {
  load([stroke("s1", [[0, 0], [10, 10]])]);
  const { container } = setup();
  expect(container.querySelectorAll("path")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Eraser" }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByTestId("ink-overlay")).toBeNull();
});
