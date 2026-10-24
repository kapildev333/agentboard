import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { CallLog, type Call } from "../src/integrations/index.js";
import { createServer } from "../src/server/index.js";
import { startDaemon } from "../src/app.js";

const call = (over: Partial<Call> = {}): Call => ({ route: "GET /api/status", status: 200, board: false, params: {}, ...over });

const token = "test-token-0123456789abcdef0123456789abcdef";
const open: { close(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map((s) => s.close())); });

async function serve() {
  const calls: Call[] = [];
  const s = await createServer({
    port: 0, token, staticDir: mkdtempSync(join(tmpdir(), "agentboard-static-")),
    routes: { "GET /api/status": async () => ({ consoles: [] }) },
    onCall: (c) => calls.push(c),
  });
  open.push(s);
  // Logged once the answer is written, which can land just after the client reads it.
  const next = async (n: number) => {
    for (let i = 0; i < 100 && calls.length < n; i++) await new Promise((r) => setTimeout(r, 10));
    return calls;
  };
  return { ...s, next };
}

// fetch will not send a foreign Host, so this goes through http.request.
const raw = (port: number, path: string, headers: Record<string, string>) =>
  new Promise<number>((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path, headers }, (res) => (res.resume(), resolve(res.statusCode!))).on("error", reject);
  });

test("the server reports each accepted call after it answers, with its route pattern and client", async () => {
  const s = await serve();
  const res = await fetch(`${s.origin}/api/status`, { headers: { "x-agentboard-token": token, "x-agentboard-client": "cli" } });
  expect(res.status).toBe(200);
  expect(await s.next(1)).toEqual([{ route: "GET /api/status", status: 200, client: "cli", board: false, params: {} }]);
});

test("a refused request is logged with its reason and Origin, and never the token", async () => {
  const s = await serve();
  const res = await fetch(`${s.origin}/hook/c1`, {
    method: "POST",
    headers: { "x-agentboard-token": token, origin: "https://evil.example", "content-type": "application/json" },
    body: JSON.stringify({ agent: "claude", event: "Stop" }),
  });
  expect(res.status).toBe(403);
  expect(await raw(s.port, "/api/status", { host: "evil.example:80", "x-agentboard-token": token })).toBe(403);
  expect(await raw(s.port, "/api/status", { host: `127.0.0.1:${s.port}` })).toBe(401);
  expect(await raw(s.port, "/api/status", { host: `127.0.0.1:${s.port}`, "x-agentboard-token": "wrong" })).toBe(401);
  const calls = await s.next(4);
  expect(calls.map(({ route, status, reason, origin }) => ({ route, status, reason, origin }))).toEqual([
    { route: "POST /hook/:consoleId", status: 403, reason: "bad Origin", origin: "https://evil.example" },
    { route: "GET /api/status", status: 403, reason: "bad Host", origin: "evil.example:80" },
    { route: "GET /api/status", status: 401, reason: "no token", origin: undefined },
    { route: "GET /api/status", status: 401, reason: "bad token", origin: undefined },
  ]);
  const log = new CallLog();
  calls.forEach((c) => log.record(c));
  expect(JSON.stringify(log.read())).not.toContain(token);
  expect(log.read().log[3]).toMatchObject({ route: "POST /hook/:consoleId", result: "403 bad Origin", origin: "https://evil.example", source: "unknown" });
});

test("keeps the last 100 calls and drops the oldest", () => {
  const log = new CallLog();
  for (let i = 0; i < 105; i++) log.record(call({ route: `GET /api/n${i}` }));
  const { log: entries } = log.read();
  expect(entries).toHaveLength(100);
  // Newest first.
  expect(entries[0]!.route).toBe("GET /api/n104");
  expect(entries[99]!.route).toBe("GET /api/n5");
});

test("names the caller by its header, the hook's console, or the board's proof", () => {
  const consoles: Record<string, { title: string; agent: string }> = { c1: { title: "Checkout flow", agent: "claude" }, c2: { title: "OpenCode", agent: "opencode" } };
  const log = new CallLog((id) => consoles[id]);
  log.record(call({ client: "cli", route: "POST /api/consoles" }));
  log.record(call({ client: "mcp" }));
  log.record(call({ route: "POST /hook/:consoleId", params: { consoleId: "c1" } }));
  log.record(call({ route: "POST /hook/:consoleId", params: { consoleId: "c2" } }));
  log.record(call({ client: "opencode-plugin", route: "POST /api/consoles" }));
  log.record(call({ client: "claude-plugin", route: "POST /hook/:consoleId", params: { consoleId: "c1" } }));
  log.record(call({ client: "7f1c0b2e-uuid-of-a-tab", board: true }));
  log.record(call({ client: "anything else" }));
  expect(log.read().log.map((e) => e.source).reverse()).toEqual(["cli", "mcp", "Checkout flow", "OpenCode", "plugin", "Checkout flow", "board", "unknown"]);
});

test("seen holds the last accepted call per integration", () => {
  const log = new CallLog((id) => (id === "c2" ? { title: "OpenCode", agent: "opencode" } : { title: "Claude", agent: "claude" }));
  expect(log.read().seen).toEqual({});
  log.record(call({ client: "cli" }));
  log.record(call({ client: "mcp", status: 401, reason: "bad token" }));
  log.record(call({ route: "POST /hook/:consoleId", params: { consoleId: "c2" } }));
  log.record(call({ route: "POST /hook/:consoleId", params: { consoleId: "c1" } }));
  const { seen, log: entries } = log.read();
  // A refused MCP call is not a working one, and a board-launched claude's hook is the relay, not the plugin.
  expect(Object.keys(seen).sort()).toEqual(["command", "opencodePlugin"]);
  expect(seen.command).toBe(entries[3]!.at);
  log.record(call({ client: "claude-plugin", route: "POST /hook/:consoleId", params: { consoleId: "c1" } }));
  expect(log.read().seen.claudePlugin).toBeDefined();
});

test("GET /api/integrations answers the daemon's log and leaves its own polls out", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentboard-int-"));
  const d = await startDaemon({ repoPath: root, home: join(root, "home"), agentPath: "" });
  open.push(d);
  const get = async (path: string, client?: string) =>
    fetch(`${d.origin}${path}`, { headers: { "x-agentboard-token": d.token, ...(client && { "x-agentboard-client": client }) } });
  expect((await get("/api/status", "cli")).status).toBe(200);
  await new Promise((r) => setTimeout(r, 50));
  await get("/api/integrations");
  const body = (await (await get("/api/integrations")).json()) as { seen: Record<string, string>; log: { source: string; route: string; result: string }[] };
  expect(body.log).toEqual([expect.objectContaining({ source: "cli", route: "GET /api/status", result: "200" })]);
  expect(body.seen.command).toBeDefined();
  delete process.env.AGENTBOARD_HOME;
});

test("a refused call never takes its source from x-agentboard-client", () => {
  const log = new CallLog();
  log.record(call({ client: "cli", status: 401, reason: "no token" }));
  log.record(call({ client: "mcp", status: 403, reason: "bad Origin", origin: "https://evil.example" }));
  expect(log.read().log.map((e) => e.source)).toEqual(["unknown", "unknown"]);
});

test("a foreign page probing GET /api/integrations is itself logged", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentboard-int-"));
  const d = await startDaemon({ repoPath: root, home: join(root, "home"), agentPath: "" });
  open.push(d);
  const probe = await fetch(`${d.origin}/api/integrations`, { headers: { "x-agentboard-token": d.token, origin: "https://evil.example" } });
  expect(probe.status).toBe(403);
  const body = (await (await fetch(`${d.origin}/api/integrations`, { headers: { "x-agentboard-token": d.token } })).json()) as { log: unknown[] };
  expect(body.log).toEqual([expect.objectContaining({ route: "GET /api/integrations", result: "403 bad Origin", origin: "https://evil.example" })]);
  delete process.env.AGENTBOARD_HOME;
});

test("a request the client abandons before the answer is still logged", async () => {
  const calls: Call[] = [];
  const s = await createServer({
    port: 0, token, staticDir: mkdtempSync(join(tmpdir(), "agentboard-static-")),
    routes: { "GET /api/status": () => new Promise(() => {}) },
    onCall: (c) => calls.push(c),
  });
  open.push(s);
  const abort = new AbortController();
  const pending = fetch(`${s.origin}/api/status`, { headers: { "x-agentboard-token": token }, signal: abort.signal }).catch(() => null);
  await new Promise((r) => setTimeout(r, 50));
  abort.abort();
  await pending;
  for (let i = 0; i < 100 && !calls.length; i++) await new Promise((r) => setTimeout(r, 10));
  expect(calls).toEqual([expect.objectContaining({ route: "GET /api/status", status: 499, reason: "client closed" })]);
});
