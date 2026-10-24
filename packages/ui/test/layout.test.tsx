import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { Board, BoardNode } from "@agentboard/shared";
import { useBoard } from "../src/board";
import { LayoutMenu } from "../src/layout";

const con = (id: string): BoardNode => ({ id, type: "console", title: id, x: 7, y: 9, w: 400, h: 300 }) as BoardNode;
const ws = () => useBoard.getState().board.workspaces[0]!;

beforeEach(() =>
  useBoard.getState().setBoard({
    version: 1,
    repoPath: "/r",
    activeWorkspaceId: "a",
    workspaces: [{ id: "a", name: "A", viewport: { x: 0, y: 0, zoom: 1 }, nodes: ["1", "2", "3", "4"].map(con) }],
  } as Board),
);
afterEach(cleanup);

const key = (target: EventTarget, init: KeyboardEventInit = {}) => fireEvent.keyDown(target, { key: "1", code: "Digit1", metaKey: true, shiftKey: true, ...init });

it("the shortcut applies a preset", () => {
  render(<LayoutMenu />);
  key(document.body);
  const [a, b] = ws().nodes;
  expect([a!.x, a!.y]).toEqual([16, 16]);
  expect(b!.x).toBeGreaterThan(a!.x + a!.w);
});

it("the shortcut is ignored while a terminal or an input has focus", () => {
  render(
    <>
      <LayoutMenu />
      <div className="xterm">
        <textarea data-testid="term" />
      </div>
      <input data-testid="field" />
    </>,
  );
  for (const id of ["term", "field"]) {
    const el = screen.getByTestId(id);
    el.focus();
    key(el);
  }
  expect(ws().nodes[0]!.x).toBe(7);
});

it("the menu lists the presets with their shortcuts", () => {
  render(<LayoutMenu />);
  fireEvent.click(screen.getByRole("button", { name: "Layout" }));
  expect(screen.getByRole("menuitem", { name: /One row.*⌘⇧2/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: /One row/ }));
  expect(ws().nodes.map((n) => n.y)).toEqual([16, 16, 16, 16]);
});

it("Save stores the layout on the workspace", () => {
  render(<LayoutMenu />);
  fireEvent.click(screen.getByRole("button", { name: "Layout" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Save current layout/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Layout name" }), { target: { value: "Mine" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(ws().layouts).toEqual([{ name: "Mine", nodes: Object.fromEntries(ws().nodes.map((n) => [n.id, { x: 7, y: 9, w: 400, h: 300 }])) }]);
});

it("a saved layout applies and deletes", () => {
  useBoard.setState(({ board }) => ({ board: { ...board, workspaces: [{ ...board.workspaces[0]!, layouts: [{ name: "Mine", nodes: { "1": { x: 50, y: 60, w: 300, h: 200 } } }] }] } }));
  render(<LayoutMenu />);
  fireEvent.click(screen.getByRole("button", { name: "Layout" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply Mine" }));
  expect(ws().nodes[0]).toMatchObject({ x: 50, y: 60, w: 300, h: 200 });
  expect(ws().nodes[1]).toMatchObject({ x: 7, y: 9 });
  fireEvent.click(screen.getByRole("button", { name: "Delete Mine" }));
  expect(ws().layouts).toEqual([]);
  expect(within(document.body).queryByText("Mine")).toBeNull();
});
