import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { WorkspaceTabs, useBoard } from "../../src/board";

beforeEach(() =>
  useBoard.getState().setBoard({
    version: 1,
    repoPath: "/r",
    activeWorkspaceId: "a",
    workspaces: [
      { id: "a", name: "A", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] },
      { id: "b", name: "B", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] },
    ],
  }),
);
afterEach(cleanup);

it("tabs are buttons, reachable from the keyboard", () => {
  render(<WorkspaceTabs />);
  expect(screen.getByRole("tab", { name: "B" }).tagName).toBe("BUTTON");
});

it("clicking a tab switches workspace", () => {
  render(<WorkspaceTabs />);
  fireEvent.click(screen.getByText("B"));
  expect(useBoard.getState().board.activeWorkspaceId).toBe("b");
});

it("the plus button creates a workspace and activates it", () => {
  render(<WorkspaceTabs />);
  fireEvent.click(screen.getByLabelText("New workspace"));
  const { workspaces, activeWorkspaceId } = useBoard.getState().board;
  expect(workspaces).toHaveLength(3);
  expect(activeWorkspaceId).toBe(workspaces[2]!.id);
});

it("double click renames", () => {
  render(<WorkspaceTabs />);
  fireEvent.doubleClick(screen.getByText("B"));
  const input = screen.getByDisplayValue("B");
  fireEvent.change(input, { target: { value: "Docs" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(useBoard.getState().board.workspaces[1]!.name).toBe("Docs");
});

it("the delete button removes a workspace", () => {
  render(<WorkspaceTabs />);
  fireEvent.click(screen.getByLabelText("Delete B"));
  expect(useBoard.getState().board.workspaces.map((w) => w.id)).toEqual(["a"]);
});
