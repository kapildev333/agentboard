import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, ConsoleNode } from "@agentboard/shared";
import { App } from "../../src/app";
import { useBoard } from "../../src/board";
import type { SocketLike } from "../../src/console";

// xterm does not run in jsdom; ConsoleNode has its own tests. The fake hands the test its onExit, keyed by node id.
const exits = vi.hoisted(() => new Map<string, (code: number | null) => void>());
vi.mock("../../src/console", () => ({
  ConsoleNode: ({ data, statusBadge, onExit }: { data: { node: { id: string; title: string } }; statusBadge?: unknown; onExit?: (code: number | null) => void }) => {
    if (onExit) exits.set(data.node.id, onExit);
    return (
      <div>
        {data.node.title} {statusBadge as never}
        <div className="console-term" tabIndex={0} data-testid="term" />
      </div>
    );
  },
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

// `spawn` replaces the POST /api/consoles reply.
function fakeApi(board: Board, spawn?: () => Response) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (spawn && String(url) === "/api/consoles" && method === "POST") return spawn();
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

    // Tab out of the menu closes it; moving between its own items does not.
    fireEvent.click(more);
    fireEvent.blur(node.getByRole("menuitem", { name: "Close Fake c2" }), { relatedTarget: more });
    expect(node.getByRole("menu")).toBeTruthy();
    fireEvent.blur(node.getByRole("menuitem", { name: "Close Fake c2" }), { relatedTarget: document.body });
    expect(node.queryByRole("menu")).toBeNull();

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
    // The count describes the button; its name stays exactly "Git".
    expect(await node.findByRole("button", { name: "Git", description: "3 dirty files" })).toBeTruthy();
    // Closing the panel drops the count: nothing refreshes it while the git card is gone.
    fireEvent.click(node.getByRole("button", { name: "Git" }));
    expect(node.getByRole("button", { name: "Git" }).getAttribute("aria-describedby")).toBeNull();
    expect(node.queryByText("3 dirty files")).toBeNull();
  });

  it("trailing slashes on the repo or the cwd do not defeat the relative path", async () => {
    const board = { ...boardWith(consoleNode("c1", { cwd: "/r/packages/ui/" }), consoleNode("c2", { cwd: "/r" })), repoPath: "/r/" };
    render(<App fetch={fakeApi(board).fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    expect(within(await screen.findByTestId("node-c1")).getByText("packages/ui")).toBeTruthy();
    expect(within(screen.getByTestId("node-c2")).getByText(".")).toBeTruthy();
  });

  it("a spawn reply that is not a console says could not start, on the card and on the banner", async () => {
    const replies = [json({ ok: true }), new Response("not json")];
    const api = fakeApi(boardWith(consoleNode("c1", { status: "stopped", session: { provider: "custom", id: "s1" } })), () => replies.shift() ?? json({ ok: true }));
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    const node = within(await screen.findByTestId("node-c1"));
    fireEvent.click(node.getByRole("button", { name: "Start fresh" }));
    expect((await node.findByRole("alert")).textContent).toBe("could not start");
    const banner = screen.getByText(/back in place as stopped/).closest("[role=status]") as HTMLElement;
    fireEvent.click(within(banner).getByRole("button", { name: "Start all fresh" }));
    expect((await within(banner).findByRole("alert")).textContent).toBe("could not start");
    expect(useBoard.getState().board.workspaces[0]!.nodes.map((n) => n.id)).toEqual(["c1"]);
  });

  it("Start fresh keeps one fresh node when the old one left the board before the reply", async () => {
    const fresh = consoleNode("fresh", { status: "starting" });
    const api = fakeApi(boardWith(consoleNode("c1", { status: "stopped" })), () => {
      // Meanwhile another tab closed c1 and the daemon's broadcast brought the fresh node in.
      const { removeNode, addNode } = useBoard.getState();
      removeNode("c1");
      addNode(fresh);
      return json(fresh);
    });
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Start fresh" })));
    await waitFor(() => expect(api.calls.some((c) => c.url === "/api/consoles" && c.method === "POST")).toBe(true));
    await act(async () => {});
    expect(useBoard.getState().board.workspaces[0]!.nodes.map((n) => n.id)).toEqual(["fresh"]);
  });

  it("the exit code leaves the pill once the console runs again", async () => {
    const api = fakeApi(boardWith(consoleNode("c1", { status: "exited" })));
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    const pill = async () => (await screen.findByTestId("node-c1")).querySelector("[data-status]")!.textContent;
    await screen.findByTestId("node-c1");
    act(() => exits.get("c1")!(3));
    expect(await pill()).toBe("Exited 3");
    const setStatus = (status: ConsoleNode["status"]) =>
      act(() => {
        const { board } = useBoard.getState();
        useBoard.setState({ board: { ...board, workspaces: board.workspaces.map((w) => ({ ...w, nodes: w.nodes.map((n) => ({ ...n, status }) as typeof n) })) } });
      });
    setStatus("starting");
    setStatus("exited");
    expect(await pill()).toBe("Exited");
  });

  it("a focused terminal rings its card, without a :has() rule re-run on every row xterm writes", async () => {
    const api = fakeApi(boardWith(consoleNode("c1")));
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    const card = (await screen.findByTestId("node-c1")).querySelector(".console-card")!;
    fireEvent.focus(screen.getByTestId("term"));
    expect(card.classList).toContain("is-focused");
    fireEvent.blur(screen.getByTestId("term"));
    expect(card.classList).not.toContain("is-focused");
    fireEvent.focus(within(card as HTMLElement).getByRole("button", { name: "Git" }));
    expect(card.classList).not.toContain("is-focused");
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
