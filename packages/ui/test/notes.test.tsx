import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NodeProps } from "@xyflow/react";
import type { Board, BoardNode } from "@agentboard/shared";
import { useBoard } from "../src/board";
import { ChecklistView, NoteView, TextView, renderMarkdown } from "../src/notes";

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

it("ticking a checklist item flips done", () => {
  setup({ ...base, type: "checklist", items: [{ text: "a", done: true }, { text: "b", done: false }, { text: "c", done: false }] });
  render(<View C={ChecklistView} />);
  expect(screen.getByText("1/3")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("b"));
  expect((stored()[0] as { items: { done: boolean }[] }).items.map((i) => i.done)).toEqual([true, true, false]);
  expect(screen.getByText("2/3")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Remove a" }));
  expect((stored()[0] as { items: unknown[] }).items).toHaveLength(2);
  const add = screen.getByPlaceholderText("Add item");
  fireEvent.change(add, { target: { value: "d" } });
  fireEvent.keyDown(add, { key: "Enter" });
  expect((stored()[0] as { items: { text: string }[] }).items.map((i) => i.text)).toEqual(["b", "c", "d"]);
});

it("markdown renders a heading and a code block and escapes raw html", () => {
  const html = renderMarkdown("# Title\n\n```\nlet a = 1 < 2;\n```\n\n<script>alert(1)</script> **b** *i* `c` [x](https://e.test)\n\n- one\n- two\n\n1. first");
  expect(html).toContain("<h1>Title</h1>");
  expect(html).toContain("<pre><code>let a = 1 &lt; 2;</code></pre>");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("<strong>b</strong> <em>i</em> <code>c</code>");
  expect(html).toContain('<a href="https://e.test" target="_blank" rel="noopener noreferrer">x</a>');
  expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
  expect(html).toContain("<ol><li>first</li></ol>");
  expect(renderMarkdown("[bad](javascript:alert(1))")).not.toContain("<a");
});

it("the text node renders its markdown and Edit swaps in a textarea that Done closes", () => {
  setup({ ...base, type: "text", markdown: "# Hi" });
  render(<View C={TextView} />);
  expect(screen.getByRole("heading", { name: "Hi" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "## Yo" } });
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect((stored()[0] as { markdown: string }).markdown).toBe("## Yo");
  expect(screen.getByRole("heading", { name: "Yo" })).toBeTruthy();
});
