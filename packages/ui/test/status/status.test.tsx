import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Board, ConsoleStatus } from "@agentboard/shared";
import { useBoard } from "../../src/board";
import { MissionMap, StatusBadge, useNotifications } from "../../src/status";

const consoleNode = (id: string, status: ConsoleStatus, agent: "claude" | "codex" = "claude") => ({
  id,
  type: "console" as const,
  title: `T-${id}`,
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  agent,
  cwd: "/r",
  status,
  createdAt: "t",
  lastActiveAt: "t",
});
const setStatuses = (statuses: Record<string, ConsoleStatus>) =>
  useBoard.getState().setBoard({
    version: 1,
    repoPath: "/r",
    activeWorkspaceId: "a",
    workspaces: [
      {
        id: "a",
        name: "A",
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: Object.entries(statuses).map(([id, s]) => consoleNode(id, s)),
      },
    ],
  } as Board);

const hidden = (v: boolean) => vi.spyOn(document, "hidden", "get").mockReturnValue(v);
const fakeNotification = () => {
  const ctor = vi.fn() as unknown as typeof Notification & ReturnType<typeof vi.fn>;
  Object.assign(ctor, { permission: "granted", requestPermission: vi.fn(async () => "granted") });
  vi.stubGlobal("Notification", ctor);
  return ctor;
};

beforeEach(() => {
  document.title = "AgentBoard";
  setStatuses({ c1: "working", c2: "idle" });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("needs_you while the tab is hidden shows a notification and badges the title", () => {
  const N = fakeNotification();
  hidden(true);
  renderHook(() => useNotifications({ onFocus: () => {} }));
  act(() => setStatuses({ c1: "needs_you", c2: "idle" }));
  expect(N).toHaveBeenCalledTimes(1);
  expect(document.title).toBe("(1) AgentBoard");
});

it("the notification is tagged by node, and its click focuses the window, closes it, then focuses the node", () => {
  const N = fakeNotification();
  const order: string[] = [];
  vi.spyOn(window, "focus").mockImplementation(() => void order.push("window"));
  hidden(true);
  const onFocus = vi.fn(() => void order.push("node"));
  renderHook(() => useNotifications({ onFocus }));
  act(() => setStatuses({ c1: "needs_you", c2: "idle" }));
  expect(N.mock.calls[0]![1]).toEqual({ body: "claude", tag: "c1", renotify: true });
  const note = N.mock.instances[0] as unknown as { onclick: () => void; close: () => void };
  note.close = vi.fn(() => void order.push("close"));
  note.onclick();
  expect(order).toEqual(["window", "close", "node"]);
  expect(onFocus).toHaveBeenCalledWith("c1");
});

it("an inline onFocus does not resubscribe, and the latest one is called", () => {
  const N = fakeNotification();
  hidden(true);
  const spy = vi.spyOn(useBoard, "subscribe");
  const a = vi.fn();
  const b = vi.fn();
  const { rerender } = renderHook(({ f }) => useNotifications({ onFocus: f }), { initialProps: { f: a } });
  rerender({ f: b });
  expect(spy).toHaveBeenCalledTimes(1);
  act(() => setStatuses({ c1: "needs_you", c2: "idle" }));
  vi.spyOn(window, "focus").mockImplementation(() => {});
  const note = N.mock.instances[0] as unknown as { onclick: () => void; close: () => void };
  note.close = vi.fn();
  note.onclick();
  expect(b).toHaveBeenCalledWith("c1");
  expect(a).not.toHaveBeenCalled();
});

it("unmounting restores the title", () => {
  setStatuses({ c1: "needs_you" });
  const { unmount } = renderHook(() => useNotifications({ onFocus: () => {} }));
  expect(document.title).toBe("(1) AgentBoard");
  unmount();
  expect(document.title).toBe("AgentBoard");
});

it("the title returns to AgentBoard when nothing needs you", () => {
  hidden(true);
  setStatuses({ c1: "needs_you" });
  renderHook(() => useNotifications({ onFocus: () => {} }));
  expect(document.title).toBe("(1) AgentBoard");
  act(() => setStatuses({ c1: "working" }));
  expect(document.title).toBe("AgentBoard");
});

const ALL: ConsoleStatus[] = ["stopped", "starting", "working", "idle", "needs_you", "exited"];

it("the badge renders every status with its label", () => {
  render(
    <>
      {ALL.map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
    </>,
  );
  for (const s of ALL) {
    const el = document.querySelector(`[data-status="${s}"]`)!;
    expect(el.textContent).toBe(s === "needs_you" ? "Needs you" : s[0]!.toUpperCase() + s.slice(1));
  }
});

it("the mission map groups consoles by status in order", () => {
  setStatuses({ a: "exited", b: "idle", c: "needs_you", d: "working", e: "starting", f: "stopped" });
  render(<MissionMap onFocus={() => {}} />);
  const groups = screen.getAllByRole("group").map((g) => g.querySelector("[data-status]")!.getAttribute("data-status"));
  expect(document.querySelectorAll('[data-status="needs_you"]')).toHaveLength(1);
  expect(groups).toEqual(["needs_you", "working", "idle", "starting", "stopped", "exited"]);
  const row = within(screen.getByRole("group", { name: /Needs you/ })).getByRole("button");
  expect(row.textContent).toContain("T-c");
  expect(row.textContent).toContain("claude");
});

it("clicking a row focuses the node", () => {
  setStatuses({ a: "idle" });
  const onFocus = vi.fn();
  render(<MissionMap onFocus={onFocus} />);
  fireEvent.click(screen.getByRole("button"));
  expect(onFocus).toHaveBeenCalledWith("a");
});

it("two pointerdowns request permission once", () => {
  const N = fakeNotification();
  Object.assign(N, { permission: "default" });
  renderHook(() => useNotifications({ onFocus: () => {} }));
  window.dispatchEvent(new Event("pointerdown"));
  window.dispatchEvent(new Event("pointerdown"));
  expect(N.requestPermission).toHaveBeenCalledTimes(1);
});

it("a visible tab creates no Notification", () => {
  const N = fakeNotification();
  hidden(false);
  renderHook(() => useNotifications({ onFocus: () => {} }));
  act(() => setStatuses({ c1: "needs_you", c2: "idle" }));
  expect(N).not.toHaveBeenCalled();
  expect(document.title).toBe("(1) AgentBoard");
});

it("only a change to needs_you notifies, once per console", () => {
  const N = fakeNotification();
  hidden(true);
  setStatuses({ c1: "needs_you", c2: "working" });
  renderHook(() => useNotifications({ onFocus: () => {} }));
  act(() => setStatuses({ c1: "needs_you", c2: "working", c3: "needs_you" }));
  expect(N).not.toHaveBeenCalled();
  act(() => setStatuses({ c1: "needs_you", c2: "needs_you", c3: "needs_you" }));
  expect(N).toHaveBeenCalledTimes(1);
  expect(N.mock.calls[0]![1]).toMatchObject({ tag: "c2" });
});

it("a pointerdown then a keydown request permission once", () => {
  const N = fakeNotification();
  Object.assign(N, { permission: "default" });
  renderHook(() => useNotifications({ onFocus: () => {} }));
  window.dispatchEvent(new Event("pointerdown"));
  window.dispatchEvent(new Event("keydown"));
  expect(N.requestPermission).toHaveBeenCalledTimes(1);
});

it("the map shows the active workspace only, the title counts every workspace", () => {
  setStatuses({ c1: "working" });
  const { board } = useBoard.getState();
  useBoard.getState().setBoard({
    ...board,
    workspaces: [...board.workspaces, { id: "b", name: "B", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [consoleNode("far", "needs_you")] }],
  });
  render(<MissionMap onFocus={() => {}} />);
  renderHook(() => useNotifications({ onFocus: () => {} }));
  expect(screen.queryByText(/T-far/)).toBeNull();
  expect(screen.getByText(/T-c1/)).toBeTruthy();
  expect(document.title).toBe("(1) AgentBoard");
});
