import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, test } from "vitest";
import { ConsoleNodeSchema, type BoardSchema } from "@agentboard/shared";
import type { z } from "zod";
import { DaemonClient } from "../src/client.js";
import { createServer } from "../src/server.js";

const board: z.infer<typeof BoardSchema> = JSON.parse(
  readFileSync(new URL("../../shared/src/fixtures/board.json", import.meta.url), "utf8"),
);
const node = ConsoleNodeSchema.parse(board.workspaces[0]!.nodes.find((n) => n.type === "console"));

const info = { port: 4777, token: "tok", pid: 1 };

function setup(
  answer: (req: { method: string; url: string; headers: Headers; body: unknown }) => unknown,
  env: Record<string, string> = {},
  status = 200,
) {
  const seen: { method: string; url: string; headers: Headers; body: unknown }[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const req = {
      method: init?.method ?? "GET",
      url,
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    seen.push(req);
    return new Response(typeof answer(req) === "string" ? (answer(req) as string) : JSON.stringify(answer(req)), { status });
  }) as typeof fetch;
  return { seen, client: new DaemonClient(() => info, fakeFetch, env) };
}

async function connect(client: DaemonClient) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(client).connect(a);
  const mcp = new Client({ name: "t", version: "0" });
  await mcp.connect(b);
  return mcp;
}

test("spawn_console returns the console id from the daemon", async () => {
  const { seen, client } = setup(() => node);
  const mcp = await connect(client);
  const res = await mcp.callTool({ name: "spawn_console", arguments: { agent: "opencode", cwd: "/tmp/x" } });
  expect(JSON.stringify(res.content)).toContain(node.id);
  expect(seen[0]!.method).toBe("POST");
  expect(seen[0]!.url).toBe("http://127.0.0.1:4777/api/consoles");
  expect(seen[0]!.headers.get("x-agentboard-token")).toBe("tok");
});

test("a tool input that fails its schema is rejected before any request", async () => {
  const { seen, client } = setup(() => node);
  const mcp = await connect(client);
  const res = await mcp.callTool({ name: "spawn_console", arguments: { agent: "emacs", cwd: "/tmp/x" } });
  expect(res.isError).toBe(true);
  expect(seen).toHaveLength(0);
});

test("get_status forwards the daemon's status", async () => {
  const { seen, client } = setup(() => ({ consoles: [node] }));
  const mcp = await connect(client);
  const res = await mcp.callTool({ name: "get_status", arguments: {} });
  expect(JSON.parse((res.content as { text: string }[])[0]!.text)).toEqual({ consoles: [node] });
  expect(seen[0]!.url).toBe("http://127.0.0.1:4777/api/status");
});

test("add_note appends a note to the board and puts it back", async () => {
  const { seen, client } = setup((r) => (r.method === "GET" ? board : { ok: true }));
  const mcp = await connect(client);
  await mcp.callTool({ name: "add_note", arguments: { text: "remember" } });
  const put = seen.find((r) => r.method === "PUT")!;
  const nodes = (put.body as typeof board).workspaces[0]!.nodes;
  expect(nodes.at(-1)).toMatchObject({ type: "note", text: "remember" });
});

const text = (res: { content: unknown }) => (res.content as { text: string }[])[0]!.text;

test("spawn_console sends AGENTBOARD_CONSOLE_ID as callerConsoleId", async () => {
  const { seen, client } = setup(() => node, { AGENTBOARD_CONSOLE_ID: "c-parent" });
  const mcp = await connect(client);
  await mcp.callTool({ name: "spawn_console", arguments: { agent: "claude", cwd: "/tmp/x" } });
  expect(seen[0]!.body).toMatchObject({ callerConsoleId: "c-parent" });
});

test("an explicit callerConsoleId wins over the environment", async () => {
  const { seen, client } = setup(() => node, { AGENTBOARD_CONSOLE_ID: "c-parent" });
  const mcp = await connect(client);
  await mcp.callTool({ name: "spawn_console", arguments: { agent: "claude", cwd: "/tmp/x", callerConsoleId: "c-me" } });
  expect(seen[0]!.body).toMatchObject({ callerConsoleId: "c-me" });
});

test("a 500 reply from the daemon is an error result", async () => {
  const { client } = setup(() => "boom", {}, 500);
  const mcp = await connect(client);
  const res = await mcp.callTool({ name: "get_status", arguments: {} });
  expect(res.isError).toBe(true);
  expect(text(res)).toContain("500");
});

test("a reply that fails the response schema is an error result", async () => {
  const { client } = setup(() => ({ nope: 1 }));
  const mcp = await connect(client);
  const res = await mcp.callTool({ name: "spawn_console", arguments: { agent: "claude", cwd: "/tmp/x" } });
  expect(res.isError).toBe(true);
});

test("open_board puts the repo in the query string", async () => {
  const { seen, client } = setup(() => board);
  const mcp = await connect(client);
  await mcp.callTool({ name: "open_board", arguments: { repo: "/tmp/my repo" } });
  expect(seen[0]!.method).toBe("GET");
  expect(seen[0]!.url).toBe("http://127.0.0.1:4777/api/board?repo=%2Ftmp%2Fmy+repo");
  expect(seen[0]!.headers.get("x-agentboard-token")).toBe("tok");
});

test("list_consoles returns only the consoles array", async () => {
  const { client } = setup(() => ({ consoles: [node] }));
  const mcp = await connect(client);
  const res = await mcp.callTool({ name: "list_consoles", arguments: {} });
  expect(JSON.parse(text(res))).toEqual([node]);
});
