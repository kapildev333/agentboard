import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, ConsoleNode } from "@agentboard/shared";
import { App } from "../../src/app";
import { useBoard } from "../../src/board";
import type { SocketLike } from "../../src/console";

// xterm does not run in jsdom; the console module is L16's and has its own tests.
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

const consoleNode = (id: string, status: ConsoleNode["status"] = "idle"): ConsoleNode => ({
  id,
  type: "console",
  title: `Fake ${id}`,
  x: 0,
  y: 0,
  w: 520,
  h: 340,
  agent: "custom",
  cwd: "/r",
  status,
  createdAt: "2026-10-23T09:00:00.000Z",
  lastActiveAt: "2026-10-23T09:00:00.000Z",
});
const boardWith = (...nodes: ConsoleNode[]): Board => ({
  version: 1,
  repoPath: "/r",
  activeWorkspaceId: "main",
  workspaces: [{ id: "main", name: "main", viewport: { x: 0, y: 0, zoom: 1 }, nodes }],
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Call = { url: string; method: string; body?: unknown };
function fakeApi(board: Board | Promise<Board>, status = 200, putStatus = 200) {
  const hold = { second: undefined as Board | undefined, gate: undefined as Promise<void> | undefined, gets: 0 };
  const calls: Call[] = [];
  const putHeaders: Record<string, string>[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (status !== 200) return json({}, status);
    if (String(url).startsWith("/api/board") && method === "GET") {
      hold.gets++;
      return json(hold.gets > 1 && hold.second ? hold.second : await board);
    }
    if (String(url) === "/api/board" && method === "PUT") {
      putHeaders.push(init?.headers as Record<string, string>);
      await hold.gate;
      return putStatus !== 200 && putHeaders.length === 1 ? json({ error: "stale" }, putStatus) : json({ ok: true, rev: ((JSON.parse(String(init?.body)) as Board).rev ?? 0) + 1 });
    }
    if (String(url) === "/api/settings") return json({ fontSize: 13, customAgents: [] });
    if (String(url).endsWith("/resume")) return json(consoleNode("c1", "starting"));
    return json({ ok: true });
  });
  return { fetch, calls, putHeaders, hold };
}

function fakeSocket() {
  const s: SocketLike & { emit(m: unknown): void } = {
    readyState: 1,
    onopen: null,
    onmessage: null,
    onclose: null,
    send() {},
    close() {},
    emit(m) {
      act(() => s.onmessage?.({ data: JSON.stringify(m) }));
    },
  };
  return s;
}

beforeEach(() => useBoard.getState().setBoard({ ...boardWith(), repoPath: "" }));
afterEach(cleanup);

describe("App", () => {
  it("mounts the Board only after the board has loaded (L15)", async () => {
    let resolve!: (b: Board) => void;
    const api = fakeApi(new Promise<Board>((r) => (resolve = r)));
    const { container } = render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    await waitFor(() => expect(api.calls.some((c) => c.url === "/api/board?repo=%2Fr")).toBe(true));
    expect(container.querySelector(".react-flow")).toBeNull();
    await act(async () => resolve(boardWith(consoleNode("c1"))));
    expect(await screen.findByTestId("node-c1")).toBeTruthy();
  });

  it("a board message from the daemon patches a console's status without saving the board", async () => {
    const api = fakeApi(boardWith(consoleNode("c1", "idle")));
    const socket = fakeSocket();
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={() => socket} />);
    await screen.findByTestId("node-c1");
    socket.emit({ t: "board", board: boardWith(consoleNode("c1", "working")) });
    await waitFor(() => expect(screen.getByTestId("node-c1").querySelector("[data-status]")!.getAttribute("data-status")).toBe("working"));
    await new Promise((r) => setTimeout(r, 700));
    expect(api.calls.filter((c) => c.method === "PUT")).toEqual([]);
  });

  it("a console spawned elsewhere (CLI, MCP) appears; another repo's board is ignored", async () => {
    const api = fakeApi(boardWith(consoleNode("c1")));
    const socket = fakeSocket();
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={() => socket} />);
    await screen.findByTestId("node-c1");
    socket.emit({ t: "board", board: { ...boardWith(consoleNode("other")), repoPath: "/elsewhere" } });
    socket.emit({ t: "board", board: boardWith(consoleNode("c1"), consoleNode("c2", "starting")) });
    expect(await screen.findByTestId("node-c2")).toBeTruthy();
    expect(screen.queryByTestId("node-other")).toBeNull();
  });

  it("removing a console from the board closes it through DELETE, and it does not come back", async () => {
    const api = fakeApi(boardWith(consoleNode("c1"), consoleNode("c2")));
    const socket = fakeSocket();
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={() => socket} />);
    await screen.findByTestId("node-c2");
    act(() => useBoard.getState().removeNode("c2"));
    await waitFor(() => expect(api.calls).toContainEqual({ url: "/api/consoles/c2", method: "DELETE", body: undefined }));
    socket.emit({ t: "board", board: boardWith(consoleNode("c1"), consoleNode("c2", "exited")) });
    expect(screen.queryByTestId("node-c2")).toBeNull();
  });

  it("a stopped console offers Resume, which posts to its resume route", async () => {
    const api = fakeApi(boardWith(consoleNode("c1", "stopped")));
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    await waitFor(() => expect(api.calls.some((c) => c.url === "/api/consoles/c1/resume" && c.method === "POST")).toBe(true));
  });

  it("without a repo in the URL the repo picker shows", async () => {
    const api = fakeApi(boardWith());
    render(<App fetch={api.fetch} search="" connect={fakeSocket} />);
    expect(await screen.findByLabelText("repo path")).toBeTruthy();
  });

  it("an unauthenticated page says how to log in", async () => {
    const api = fakeApi(boardWith(), 401);
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/agentboard open/);
  });

  it("when the daemon goes away the page says so instead of showing stale statuses", async () => {
    const api = fakeApi(boardWith(consoleNode("c1", "working")));
    const sockets: ReturnType<typeof fakeSocket>[] = [];
    const connect = () => {
      const s = fakeSocket();
      sockets.push(s);
      return s;
    };
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={connect} />);
    await screen.findByTestId("node-c1");
    api.fetch.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    act(() => sockets[0]!.onclose?.());
    expect((await screen.findByRole("alert")).textContent).toMatch(/daemon stopped.*agentboard open/i);
    expect(screen.queryByTestId("node-c1")).toBeNull();
    await new Promise((r) => setTimeout(r, 1200));
    expect(sockets).toHaveLength(1);
  });

  it("a dropped socket to a live daemon reconnects after about a second and shows no alert", async () => {
    const api = fakeApi(boardWith(consoleNode("c1", "working")));
    const sockets: ReturnType<typeof fakeSocket>[] = [];
    const connect = () => {
      const s = fakeSocket();
      sockets.push(s);
      return s;
    };
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={connect} />);
    await screen.findByTestId("node-c1");
    act(() => sockets[0]!.onclose?.());
    await waitFor(() => expect(api.calls.some((c) => c.url === "/api/status")).toBe(true));
    await waitFor(() => expect(sockets).toHaveLength(2), { timeout: 2000 });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("node-c1")).toBeTruthy();
  });

  const note = (id: string, text: string) => ({ id, type: "note" as const, title: "Note", x: 5, y: 5, w: 200, h: 100, text });
  const withNote = (rev: number, ...notes: ReturnType<typeof note>[]): Board => {
    const b = boardWith(consoleNode("c1"));
    b.workspaces[0]!.nodes.push(...notes);
    return { ...b, rev };
  };
  const puts = (api: ReturnType<typeof fakeApi>) => api.calls.filter((c) => c.method === "PUT" && c.url === "/api/board");

  it("a note added elsewhere appears, and the next save (after a zoom) keeps it with the page's own viewport", async () => {
    const api = fakeApi({ ...boardWith(consoleNode("c1")), rev: 1 });
    const socket = fakeSocket();
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={() => socket} />);
    await screen.findByTestId("node-c1");
    act(() => useBoard.getState().setViewport({ x: 7, y: 8, zoom: 0.5 }));
    socket.emit({ t: "board", board: withNote(2, note("n1", "from cli")) });
    expect(await screen.findByText("from cli")).toBeTruthy();
    await waitFor(() => expect(puts(api)).toHaveLength(1), { timeout: 1500 });
    const sent = puts(api)[0]!.body as Board;
    expect(sent.workspaces[0]!.nodes.map((n) => n.id)).toEqual(["c1", "n1"]);
    expect(sent.workspaces[0]!.viewport).toEqual({ x: 7, y: 8, zoom: 0.5 });
    expect(sent.rev).toBe(2);
  });

  it("a note removed elsewhere disappears; one the page added itself stays", async () => {
    const api = fakeApi(withNote(1, note("n1", "old")));
    const socket = fakeSocket();
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={() => socket} />);
    await screen.findByText("old");
    act(() => useBoard.getState().addNode(note("mine", "local") as never));
    socket.emit({ t: "board", board: withNote(2) });
    await waitFor(() => expect(screen.queryByText("old")).toBeNull());
    expect(screen.getByText("local")).toBeTruthy();
  });

  it("a save sends the client id and the rev, and the next save sends the rev the daemon answered", async () => {
    const api = fakeApi({ ...boardWith(consoleNode("c1")), rev: 4 });
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    await screen.findByTestId("node-c1");
    act(() => useBoard.getState().setViewport({ x: 1, y: 1, zoom: 1 }));
    await waitFor(() => expect(puts(api)).toHaveLength(1), { timeout: 1500 });
    expect(api.putHeaders[0]!["x-agentboard-client"]).toMatch(/./);
    expect((puts(api)[0]!.body as Board).rev).toBe(4);
    act(() => useBoard.getState().setViewport({ x: 2, y: 2, zoom: 1 }));
    await waitFor(() => expect(puts(api)).toHaveLength(2), { timeout: 1500 });
    expect((puts(api)[1]!.body as Board).rev).toBe(5);
    expect(api.putHeaders[1]!["x-agentboard-client"]).toBe(api.putHeaders[0]!["x-agentboard-client"]);
  });

  it("a save the daemon refuses with 409 reloads the board, and the next save carries the reloaded rev", async () => {
    const api = fakeApi({ ...boardWith(consoleNode("c1")), rev: 1 }, 200, 409);
    api.hold.second = withNote(7, note("n9", "newer"));
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    await screen.findByTestId("node-c1");
    act(() => useBoard.getState().setViewport({ x: 1, y: 1, zoom: 1 }));
    expect(await screen.findByText("newer", {}, { timeout: 1500 })).toBeTruthy();
    act(() => useBoard.getState().setViewport({ x: 2, y: 2, zoom: 1 }));
    await waitFor(() => expect(puts(api)).toHaveLength(2), { timeout: 1500 });
    expect((puts(api)[1]!.body as Board).rev).toBe(7);
  });

  it("the socket opens with the same client id the saves send, and the default connect puts it in the URL", async () => {
    const ids: string[] = [];
    const api = fakeApi({ ...boardWith(consoleNode("c1")), rev: 1 });
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={(c) => (ids.push(c), fakeSocket())} />);
    await screen.findByTestId("node-c1");
    act(() => useBoard.getState().setViewport({ x: 1, y: 1, zoom: 1 }));
    await waitFor(() => expect(api.putHeaders).toHaveLength(1), { timeout: 1500 });
    expect(ids).toEqual([api.putHeaders[0]!["x-agentboard-client"]]);
    cleanup();
    const urls: string[] = [];
    vi.stubGlobal("WebSocket", class { constructor(u: string) { urls.push(u); } close() {} });
    try {
      const api2 = fakeApi({ ...boardWith(consoleNode("c1")), rev: 1 });
      render(<App fetch={api2.fetch} search="?repo=%2Fr" />);
      await screen.findAllByTestId("node-c1");
      act(() => useBoard.getState().setViewport({ x: 1, y: 1, zoom: 1 }));
      await waitFor(() => expect(api2.putHeaders).toHaveLength(1), { timeout: 1500 });
      expect(urls[0]).toMatch(/^ws:\/\/[^/]+\/ws\?client=/);
      expect(new URL(urls[0]!).searchParams.get("client")).toBe(api2.putHeaders[0]!["x-agentboard-client"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  const nodeOf = (id: string) => useBoard.getState().board.workspaces[0]!.nodes.find((n) => n.id === id)!;

  it("the daemon's note text wins and the page's own unsaved move stays", async () => {
    const api = fakeApi(withNote(1, note("n1", "old")));
    const socket = fakeSocket();
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={() => socket} />);
    await screen.findByText("old");
    act(() => useBoard.getState().moveNode("n1", 50, 60));
    socket.emit({ t: "board", board: withNote(2, note("n1", "old")) });
    expect(nodeOf("n1")).toMatchObject({ x: 50, y: 60 });
    socket.emit({ t: "board", board: withNote(3, note("n1", "new text")) });
    expect(await screen.findByText("new text")).toBeTruthy();
    expect(nodeOf("n1")).toMatchObject({ x: 50, y: 60, text: "new text" });
  });

  it("a position another tab saved is taken when this page did not move the node", async () => {
    const api = fakeApi(withNote(1, note("n1", "t")));
    const socket = fakeSocket();
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={() => socket} />);
    await screen.findByText("t");
    socket.emit({ t: "board", board: withNote(2, { ...note("n1", "t"), x: 300, y: 310 }) });
    expect(nodeOf("n1")).toMatchObject({ x: 300, y: 310 });
    await new Promise((r) => setTimeout(r, 700));
    expect(puts(api)).toEqual([]);
  });

  it("a note that arrives during unsaved edits is gone when the daemon later drops it", async () => {
    const api = fakeApi({ ...boardWith(consoleNode("c1")), rev: 1 });
    const socket = fakeSocket();
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={() => socket} />);
    await screen.findByTestId("node-c1");
    act(() => useBoard.getState().setViewport({ x: 9, y: 9, zoom: 1 }));
    socket.emit({ t: "board", board: withNote(2, note("n1", "brief")) });
    expect(await screen.findByText("brief")).toBeTruthy();
    socket.emit({ t: "board", board: withNote(3) });
    await waitFor(() => expect(screen.queryByText("brief")).toBeNull());
  });

  it("an edit made while a save is in flight is saved again", async () => {
    const api = fakeApi({ ...boardWith(consoleNode("c1")), rev: 1 });
    let release!: () => void;
    api.hold.gate = new Promise<void>((r) => (release = r));
    render(<App fetch={api.fetch} search="?repo=%2Fr" connect={fakeSocket} />);
    await screen.findByTestId("node-c1");
    act(() => useBoard.getState().setViewport({ x: 1, y: 1, zoom: 1 }));
    await waitFor(() => expect(puts(api)).toHaveLength(1), { timeout: 1500 });
    act(() => useBoard.getState().setViewport({ x: 2, y: 2, zoom: 1 }));
    api.hold.gate = undefined;
    await act(async () => release());
    await waitFor(() => expect(puts(api)).toHaveLength(2), { timeout: 1500 });
    expect((puts(api)[1]!.body as Board).workspaces[0]!.viewport).toEqual({ x: 2, y: 2, zoom: 1 });
  });
});
