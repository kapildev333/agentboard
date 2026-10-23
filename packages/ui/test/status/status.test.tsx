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
  const groups = screen.getAllByRole("group").map((g) => g.getAttribute("data-status"));
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
