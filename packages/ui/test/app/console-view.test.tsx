import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, ConsoleNode } from "@agentboard/shared";
import { App } from "../../src/app";
import { useBoard } from "../../src/board";
import type { SocketLike } from "../../src/console";

// xterm does not run in jsdom; ConsoleNode has its own tests.
vi.mock("../../src/console", () => ({
  ConsoleNode: ({ data, statusBadge }: { data: { node: { title: string } }; statusBadge?: unknown }) => (
    <div>
      {data.node.title} {statusBadge as never}
    </div>
  ),
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.DOMMatrixReadOnly ??= class {
    m22 = 1;
  } as never;
});

const consoleNode = (id: string, extra: Partial<ConsoleNode> = {}): ConsoleNode => ({
  id,
  type: "console",
  title: `Fake ${id}`,
  x: 0,
  y: 0,
  w: 520,
  h: 340,
  agent: "custom",
  cwd: "/r",
  status: "idle",
  createdAt: "2026-10-23T09:00:00.000Z",
  lastActiveAt: "2026-10-23T09:00:00.000Z",
  ...extra,
});
const boardWith = (...nodes: ConsoleNode[]): Board => ({
  version: 1,
  repoPath: "/r",
  activeWorkspaceId: "main",
  workspaces: [{ id: "main", name: "main", viewport: { x: 0, y: 0, zoom: 1 }, nodes }],
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeApi(board: Board) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (String(url).startsWith("/api/board") && method === "GET") return json(board);
    if (String(url) === "/api/board") return json({ ok: true, rev: 1 });
    if (String(url) === "/api/settings") return json({ fontSize: 13, customAgents: [] });
    if (String(url).startsWith("/api/git/status")) return json({ branch: "main", ahead: 0, behind: 0, dirty: 3, lastCommit: null });
    if (String(url) === "/api/consoles" && method === "POST") return json(consoleNode("fresh", { title: "Fake", status: "starting", x: 900 }));
    if (String(url).endsWith("/resume")) return json(consoleNode("c1", { status: "starting" }));
    return json({ ok: true });
  });
  return { fetch, calls };
}

const fakeSocket = (): SocketLike => ({ readyState: 1, onopen: null, onmessage: null, onclose: null, send() {}, close() {} });

beforeEach(() => useBoard.getState().setBoard({ ...boardWith(), repoPath: "" }));
afterEach(cleanup);

describe("ConsoleView", () => {
  it("More actions opens a menu with Close and the restart banner offers Resume all", async () => {
    const api = fakeApi(boardWith(consoleNode("c1", { status: "stopped", agent: "claude", session: { provider: "claude", id: "s1" } }), consoleNode("c2", { status: "working" })));
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);

    const banner = await screen.findByText(/· 1 console is back in place as stopped/);
    fireEvent.click(within(banner.closest("[role=status]") as HTMLElement).getByRole("button", { name: "Resume all" }));
    await waitFor(() => expect(api.calls).toContainEqual({ url: "/api/consoles/c1/resume", method: "POST", body: undefined }));

    const node = within(screen.getByTestId("node-c2"));
    const more = node.getByRole("button", { name: "More actions" });
    fireEvent.click(more);
    const menu = node.getByRole("menu");
    expect(within(menu).queryByRole("menuitem", { name: "Resume" })).toBeNull();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(node.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(more);

    fireEvent.click(more);
    fireEvent.click(node.getByRole("menuitem", { name: "Close Fake c2" }));
    await waitFor(() => expect(api.calls).toContainEqual({ url: "/api/consoles/c2", method: "DELETE", body: undefined }));
  });

  it("the restart banner dismisses, and a stopped console's menu offers Resume", async () => {
    const api = fakeApi(boardWith(consoleNode("c1", { status: "stopped", session: { provider: "custom", id: "s1" } })));
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Daemon restarted/)).toBeNull();
    const node = within(screen.getByTestId("node-c1"));
    fireEvent.click(node.getByRole("button", { name: "More actions" }));
    fireEvent.click(node.getByRole("menuitem", { name: "Resume" }));
    await waitFor(() => expect(api.calls.some((c) => c.url === "/api/consoles/c1/resume")).toBe(true));
  });

  it("the footer shows the cwd relative to the repo, Open lists the editors, and Git counts dirty files once loaded", async () => {
    const api = fakeApi(boardWith(consoleNode("c1", { cwd: "/r/packages/ui" })));
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    const node = within(await screen.findByTestId("node-c1"));
    expect(node.getByText("packages/ui")).toBeTruthy();
    fireEvent.click(node.getByRole("button", { name: "Open" }));
    fireEvent.click(node.getByRole("button", { name: "Zed" }));
    await waitFor(() => expect(api.calls).toContainEqual({ url: "/api/open", method: "POST", body: { editor: "zed", path: "/r/packages/ui" } }));
    fireEvent.pointerDown(document.body);
    expect(node.queryByRole("button", { name: "Zed" })).toBeNull();
    fireEvent.click(node.getByRole("button", { name: "Git" }));
    expect(await node.findByRole("button", { name: "Git 3 dirty" })).toBeTruthy();
  });

  it("Start fresh spawns the same agent in the same cwd and takes the stopped node's place", async () => {
    const api = fakeApi(boardWith(consoleNode("c1", { status: "stopped", customId: "fake", x: 40 })));
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Start fresh" })));
    await waitFor(() => expect(api.calls).toContainEqual({ url: "/api/consoles/c1", method: "DELETE", body: undefined }));
    expect(api.calls).toContainEqual({ url: "/api/consoles", method: "POST", body: { agent: "custom", cwd: "/r", customId: "fake" } });
    const nodes = useBoard.getState().board.workspaces[0]!.nodes;
    expect(nodes.map((n) => [n.id, n.title, n.x])).toEqual([["fresh", "Fake c1", 40]]);
  });
});
