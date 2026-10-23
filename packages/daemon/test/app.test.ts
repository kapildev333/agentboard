import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import WebSocket from "ws";
import type { Board, ConsoleNode, DaemonMessage } from "@agentboard/shared";
import { startDaemon } from "../src/app.js";

const fakeAgent = fileURLToPath(new URL("../../e2e/fake-agent/index.mjs", import.meta.url));
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
  delete process.env.AGENTBOARD_HOME;
});

// A home with the fake agent as a custom agent, a repo, and a PATH holding only a stub `claude` that prints a version.
function setup() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "agentboard-app-")));
  const [home, repo, path] = ["home", "repo", "path"].map((d) => join(root, d)) as [string, string, string];
  for (const d of [home, repo, path]) mkdirSync(d);
  writeFileSync(join(path, "claude"), "#!/bin/sh\necho '9.9.9 (stub)'\n");
  chmodSync(join(path, "claude"), 0o755);
  writeFileSync(
    join(home, "settings.json"),
    JSON.stringify({ fontSize: 13, customAgents: [{ id: "fake", name: "Fake", command: process.execPath, args: [fakeAgent], needsYou: "approve\\?" }] }),
  );
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  return { home, repo, path };
}

async function start(s: ReturnType<typeof setup>) {
  const d = await startDaemon({ repoPath: s.repo, home: s.home, agentPath: s.path });
  cleanup.push(() => d.close());
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${d.origin}${path}`, {
      method,
      headers: { "x-agentboard-token": d.token, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as never };
  };
  return { ...d, call };
}

function socket(d: { origin: string; token: string }) {
  const ws = new WebSocket(d.origin.replace("http", "ws") + "/ws", { headers: { "x-agentboard-token": d.token, origin: d.origin } });
  const messages: DaemonMessage[] = [];
  ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
  cleanup.push(() => ws.close());
  const opened = new Promise<void>((resolve) => ws.on("open", () => resolve()));
  const output = (id: string) => messages.filter((m) => m.t === "output" && m.consoleId === id).map((m) => (m as { data: string }).data).join("");
  return { ws, messages, opened, output, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

async function until<T>(f: () => T | Promise<T>, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await f();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const consolesOf = (b: Board) => b.workspaces.flatMap((w) => w.nodes).filter((n): n is ConsoleNode => n.type === "console");

test("startDaemon writes daemon.json, serves the repo's board, and close removes the file", async () => {
  const s = setup();
  const d = await start(s);
  const info = JSON.parse(readFileSync(join(s.home, "daemon.json"), "utf8"));
  expect(info).toEqual({ port: d.port, token: d.token, pid: process.pid });
  expect(d.origin).toBe(`http://127.0.0.1:${d.port}`);
  const board = await d.call("GET", `/api/board?repo=${encodeURIComponent(s.repo)}`);
  expect(board.status).toBe(200);
  expect((board.body as Board).repoPath).toBe(s.repo);
  await d.close();
  expect(existsSync(join(s.home, "daemon.json"))).toBe(false);
});

test("a second daemon refuses while the pid in daemon.json answers; a dead pid is replaced (L19)", async () => {
  const s = setup();
  await start(s);
  await expect(startDaemon({ repoPath: s.repo, home: s.home, agentPath: s.path })).rejects.toThrow(/already running/);
  const s2 = setup();
  const dead = spawnSync(process.execPath, ["-e", ""]).pid;
  writeFileSync(join(s2.home, "daemon.json"), JSON.stringify({ port: 1, token: "t", pid: dead }));
  const d2 = await start(s2);
  expect(JSON.parse(readFileSync(join(s2.home, "daemon.json"), "utf8")).port).toBe(d2.port);
});

test("GET /api/agents scans the given PATH and lists the custom agents from settings (L14)", async () => {
  const s = setup();
  const d = await start(s);
  const { body } = await d.call("GET", "/api/agents");
  expect(body).toContainEqual({ id: "claude", command: "claude", version: "9.9.9 (stub)", available: true });
  expect(body).toContainEqual({ id: "codex", command: "codex", version: null, available: false });
  expect(body).toContainEqual({ id: "custom", command: process.execPath, version: null, available: true, customId: "fake", name: "Fake" });
});

test("a spawned console streams output over the socket, takes input, turns working, and is broadcast on the board", async () => {
  const s = setup();
  const d = await start(s);
  const sock = socket(d);
  await sock.opened;
  const { status, body } = await d.call("POST", "/api/consoles", { agent: "custom", customId: "fake", cwd: s.repo });
  expect(status).toBe(200);
  const node = body as ConsoleNode;
  expect(node).toMatchObject({ type: "console", agent: "custom", cwd: s.repo, status: "starting", title: "Fake" });
  sock.send({ t: "attach", consoleId: node.id });
  await until(() => sock.output(node.id).includes("fake>"));
  sock.send({ t: "input", consoleId: node.id, data: "hello\r" });
  await until(() => sock.output(node.id).includes("you said: hello"));
  const status1 = await until(async () => {
    const st = (await d.call("GET", "/api/status")).body as { consoles: ConsoleNode[] };
    return st.consoles.find((c) => c.id === node.id && c.status === "working");
  });
  expect(status1!.status).toBe("working");
  const boardMsg = sock.messages.filter((m) => m.t === "board").at(-1) as { board: Board } | undefined;
  expect(consolesOf(boardMsg!.board).map((c) => c.id)).toContain(node.id);
});

test("a late attach replays the ring buffer", async () => {
  const s = setup();
  const d = await start(s);
  const node = (await d.call("POST", "/api/consoles", { agent: "custom", customId: "fake", cwd: s.repo })).body as ConsoleNode;
  await new Promise((r) => setTimeout(r, 500));
  const sock = socket(d);
  await sock.opened;
  sock.send({ t: "attach", consoleId: node.id });
  await until(() => sock.output(node.id).includes("fake>"));
});

test("spawning an unknown custom agent answers 400", async () => {
  const s = setup();
  const d = await start(s);
  const res = await d.call("POST", "/api/consoles", { agent: "custom", customId: "nope", cwd: s.repo });
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: "unknown custom agent: nope" });
});

test("a console spawned with callerConsoleId lands beside the caller", async () => {
  const s = setup();
  const d = await start(s);
  const a = (await d.call("POST", "/api/consoles", { agent: "custom", customId: "fake", cwd: s.repo })).body as ConsoleNode;
  const b = (await d.call("POST", "/api/consoles", { agent: "custom", customId: "fake", cwd: s.repo, callerConsoleId: a.id })).body as ConsoleNode;
  expect(b.x).toBe(a.x + a.w + 40);
  expect(b.y).toBe(a.y);
});

test("DELETE kills the console and removes its node", async () => {
  const s = setup();
  const d = await start(s);
  const node = (await d.call("POST", "/api/consoles", { agent: "custom", customId: "fake", cwd: s.repo })).body as ConsoleNode;
  expect((await d.call("DELETE", `/api/consoles/${node.id}`)).body).toEqual({ ok: true });
  const board = (await d.call("GET", `/api/board?repo=${encodeURIComponent(s.repo)}`)).body as Board;
  expect(consolesOf(board)).toEqual([]);
  expect((await d.call("DELETE", `/api/consoles/${node.id}`)).status).toBe(404);
});

test("after a restart every console is stopped, and resume starts it again in place (L10)", async () => {
  const s = setup();
  const d1 = await start(s);
  const node = (await d1.call("POST", "/api/consoles", { agent: "custom", customId: "fake", cwd: s.repo })).body as ConsoleNode;
  await d1.close();
  const d2 = await start(s);
  const board = (await d2.call("GET", `/api/board?repo=${encodeURIComponent(s.repo)}`)).body as Board;
  expect(consolesOf(board).map((c) => [c.id, c.status, c.x])).toEqual([[node.id, "stopped", node.x]]);
  const sock = socket(d2);
  await sock.opened;
  sock.send({ t: "attach", consoleId: node.id });
  const resumed = await d2.call("POST", `/api/consoles/${node.id}/resume`);
  expect(resumed.status).toBe(200);
  expect(resumed.body).toMatchObject({ id: node.id, status: "starting" });
  await until(() => sock.output(node.id).includes("fake>"));
  expect((await d2.call("POST", `/api/consoles/${node.id}/resume`)).status).toBe(409);
});

test("PUT /api/board keeps the daemon's status and running consoles the page did not know about", async () => {
  const s = setup();
  const d = await start(s);
  const node = (await d.call("POST", "/api/consoles", { agent: "custom", customId: "fake", cwd: s.repo })).body as ConsoleNode;
  const board = (await d.call("GET", `/api/board?repo=${encodeURIComponent(s.repo)}`)).body as Board;
  const moved = structuredClone(board);
  const c = consolesOf(moved)[0]!;
  c.x = 999;
  c.status = "needs_you";
  expect((await d.call("PUT", "/api/board", moved)).body).toEqual({ ok: true });
  let after = (await d.call("GET", `/api/board?repo=${encodeURIComponent(s.repo)}`)).body as Board;
  expect(consolesOf(after)[0]).toMatchObject({ id: node.id, x: 999 });
  expect(consolesOf(after)[0]!.status).not.toBe("needs_you");
  const stale = structuredClone(board);
  stale.workspaces[0]!.nodes = [];
  await d.call("PUT", "/api/board", stale);
  after = (await d.call("GET", `/api/board?repo=${encodeURIComponent(s.repo)}`)).body as Board;
  expect(consolesOf(after).map((n) => n.id)).toEqual([node.id]);
});

test("GET and PUT /api/settings round-trip through settings.json", async () => {
  const s = setup();
  const d = await start(s);
  const settings = (await d.call("GET", "/api/settings")).body as { fontSize: number };
  expect(settings.fontSize).toBe(13);
  await d.call("PUT", "/api/settings", { ...settings, fontSize: 16 });
  expect(JSON.parse(readFileSync(join(s.home, "settings.json"), "utf8")).fontSize).toBe(16);
});

test("settings default when settings.json is missing", async () => {
  const s = setup();
  rmSync(join(s.home, "settings.json"));
  const d = await start(s);
  expect((await d.call("GET", "/api/settings")).body).toEqual({ fontSize: 13, customAgents: [] });
});

test("POST /api/open with a relative path answers 400 with the reason (L22)", async () => {
  const s = setup();
  const d = await start(s);
  const res = await d.call("POST", "/api/open", { editor: "code", path: "relative" });
  expect(res).toEqual({ status: 400, body: { error: 'path must be absolute: "relative"' } });
});

test("hook posts reach the console and unknown consoles answer 404", async () => {
  const s = setup();
  const d = await start(s);
  const node = (await d.call("POST", "/api/consoles", { agent: "custom", customId: "fake", cwd: s.repo })).body as ConsoleNode;
  expect((await d.call("POST", `/hook/${node.id}`, { agent: "custom", event: "x" })).body).toEqual({ ok: true });
  expect((await d.call("POST", "/hook/nope", { agent: "custom", event: "x" })).status).toBe(404);
});
