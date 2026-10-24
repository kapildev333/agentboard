import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useContext } from "react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import type { Board, ConsoleNode } from "@agentboard/shared";
import { App } from "../../src/app";
import { useBoard } from "../../src/board";
import type { SocketLike } from "../../src/console";
import { StudioContext, type Studio } from "../../src/studios/context";

const seen: { ctx: Studio | null } = { ctx: null };
vi.mock("../../src/console", () => ({ ConsoleNode: () => <div /> }));
vi.mock("../../src/studios/code/CodeStudio", () => ({
  CodeStudio: () => {
    seen.ctx = useContext(StudioContext);
    return <h1>Code</h1>;
  },
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(() => {
  cleanup();
  location.hash = "";
});

const board: Board = { version: 1, repoPath: "/r", activeWorkspaceId: "main", workspaces: [{ id: "main", name: "main", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] }] };
const node: ConsoleNode = { id: "c9", type: "console", title: "Claude", x: 0, y: 0, w: 520, h: 340, agent: "claude", cwd: "/r", status: "starting", createdAt: "2026-10-23T09:00:00.000Z", lastActiveAt: "2026-10-23T09:00:00.000Z" };

test("the studio context types into a console and spawns a titled console in the repo", async () => {
  const calls: { url: string; body: unknown }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const body = String(url).startsWith("/api/board") ? board : String(url) === "/api/consoles" ? node : String(url) === "/api/settings" ? { fontSize: 13, customAgents: [] } : { ok: true };
    return new Response(JSON.stringify(body));
  });
  location.hash = "#/code";
  const socket = (): SocketLike => ({ readyState: 1, onopen: null, onmessage: null, onclose: null, send() {}, close() {} });
  render(<App fetch={fetch} search="?repo=%2Fr" connect={socket} />);
  await waitFor(() => expect(seen.ctx?.repo).toBe("/r"));
  await act(() => seen.ctx!.sendInput("c1", "src/a.ts:3-5 "));
  expect(calls).toContainEqual({ url: "/api/consoles/c1/input", body: { data: "src/a.ts:3-5 " } });
  await act(() => seen.ctx!.spawn("write docs/handbook.md", { title: "Handbook" }));
  expect(calls).toContainEqual({ url: "/api/consoles", body: { agent: "claude", cwd: "/r", prompt: "write docs/handbook.md" } });
  expect(useBoard.getState().board.workspaces[0]!.nodes).toMatchObject([{ id: "c9", title: "Handbook" }]);
  expect(seen.ctx!.consoles.map((c) => c.id)).toEqual(["c9"]);
});

test("a spawned console the daemon's broadcast already put on the board is renamed, not added twice", async () => {
  const fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    // The daemon broadcasts the board with the new console before the POST answers.
    if (u === "/api/consoles") useBoard.getState().addNode(node);
    return new Response(JSON.stringify(u.startsWith("/api/board") ? board : u === "/api/consoles" ? node : u === "/api/settings" ? { fontSize: 13, customAgents: [] } : { ok: true }));
  });
  location.hash = "#/code";
  const socket = (): SocketLike => ({ readyState: 1, onopen: null, onmessage: null, onclose: null, send() {}, close() {} });
  render(<App fetch={fetch} search="?repo=%2Fr" connect={socket} />);
  await waitFor(() => expect(seen.ctx?.board.workspaces[0]!.nodes).toEqual([]));
  await act(() => seen.ctx!.spawn("p", { title: "Handbook" }));
  expect(useBoard.getState().board.workspaces[0]!.nodes).toMatchObject([{ id: "c9", title: "Handbook" }]);
});
