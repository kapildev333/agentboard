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

function setup(answer: (req: { method: string; url: string; headers: Headers; body: unknown }) => unknown) {
  const seen: { method: string; url: string; headers: Headers; body: unknown }[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const req = {
      method: init?.method ?? "GET",
      url,
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    seen.push(req);
    return new Response(JSON.stringify(answer(req)), { status: 200 });
  }) as typeof fetch;
  return { seen, client: new DaemonClient(info, fakeFetch, {}) };
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
