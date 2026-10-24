import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NodeProps } from "@xyflow/react";
import type { Board, BoardNode } from "@agentboard/shared";
import { useBoard } from "../src/board";
import { NoteView } from "../src/notes";

const setup = (n: BoardNode) => {
  useBoard.getState().setBoard({
    version: 1,
    repoPath: "/r",
    activeWorkspaceId: "a",
    workspaces: [{ id: "a", name: "A", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [n] }],
  } as Board);
};
const stored = () => useBoard.getState().board.workspaces[0]!.nodes;
// Like the board, hand the view whatever node the store holds now.
const View = ({ C }: { C: (p: NodeProps) => React.ReactNode }) => {
  const live = useBoard((s) => s.board.workspaces[0]!.nodes[0]);
  return <>{C({ data: { node: live } } as unknown as NodeProps)}</>;
};
const base = { id: "n1", title: "", x: 0, y: 0, w: 240, h: 160 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("typing in a note saves the text to the store", () => {
  setup({ ...base, type: "note", text: "" });
  render(<View C={NoteView} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } });
  expect((stored()[0] as { text: string }).text).toBe("");
  act(() => void vi.advanceTimersByTime(300));
  expect((stored()[0] as { text: string }).text).toBe("hello");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "bye" } });
  fireEvent.blur(screen.getByRole("textbox"));
  expect((stored()[0] as { text: string }).text).toBe("bye");
});
