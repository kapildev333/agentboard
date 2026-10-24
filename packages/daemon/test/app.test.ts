import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

function socket(d: { origin: string; token: string }, client?: string) {
  const ws = new WebSocket(d.origin.replace("http", "ws") + "/ws" + (client ? `?client=${client}` : ""), { headers: { "x-agentboard-token": d.token, origin: d.origin } });
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
  // the scan never runs a binary (D38): no version until a console has run it
  expect(body).toContainEqual({ id: "claude", command: "claude", version: null, available: true });
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

test("spawning a custom agent without a customId answers 400 naming the missing id", async () => {
  const s = setup();
  const d = await start(s);
  const res = await d.call("POST", "/api/consoles", { agent: "custom", cwd: s.repo });
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: "custom agents need a customId" });
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

const noteNode = (id: string, text: string) => ({ id, type: "note" as const, title: "Note", x: 0, y: 0, w: 100, h: 100, text });
const boardOf = async (d: Awaited<ReturnType<typeof start>>, repo: string) => (await d.call("GET", `/api/board?repo=${encodeURIComponent(repo)}`)).body as Board;

test("a note added through PUT /api/board reaches an open page", async () => {
  const s = setup();
  const d = await start(s);
  const page = socket(d);
  await page.opened;
  const board = await boardOf(d, s.repo);
  board.workspaces[0]!.nodes.push(noteNode("n1", "cli note"));
  expect((await d.call("PUT", "/api/board", board)).status).toBe(200);
  await until(() => page.messages.find((x) => x.t === "board" && x.board.workspaces[0]!.nodes.some((n) => n.id === "n1")));
});

test("a PUT with a client id skips that client's socket and reaches the others", async () => {
  const s = setup();
  const d = await start(s);
  const mine = socket(d, "me");
  const other = socket(d, "you");
  await Promise.all([mine.opened, other.opened]);
  const board = await boardOf(d, s.repo);
  const res = await fetch(`${d.origin}/api/board`, {
    method: "PUT",
    headers: { "x-agentboard-token": d.token, "content-type": "application/json", "x-agentboard-client": "me" },
    body: JSON.stringify(board),
  });
  expect(res.status).toBe(200);
  await until(() => other.messages.some((x) => x.t === "board" && x.board.rev === (board.rev ?? 0) + 1));
  expect(mine.messages.some((x) => x.t === "board" && x.board.rev === (board.rev ?? 0) + 1)).toBe(false);
});

test("a PUT older than the saved board answers 409 and changes nothing; each PUT answers the new rev", async () => {
  const s = setup();
  const d = await start(s);
  const board = await boardOf(d, s.repo);
  expect((await d.call("PUT", "/api/board", board)).body).toEqual({ ok: true, rev: (board.rev ?? 0) + 1 });
  board.workspaces[0]!.nodes.push(noteNode("n2", "stale"));
  expect((await d.call("PUT", "/api/board", board)).status).toBe(409);
  expect((await boardOf(d, s.repo)).workspaces[0]!.nodes).toEqual([]);
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
  expect((await d.call("PUT", "/api/board", moved)).body).toEqual({ ok: true, rev: 1 });
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

test("spawning an agent runs the binary found on agentPath and reads its version then, once (D38)", async () => {
  const s = setup();
  const d = await start(s);
  const sock = socket(d);
  await sock.opened;
  const node = (await d.call("POST", "/api/consoles", { agent: "claude", cwd: s.repo })).body as ConsoleNode;
  sock.send({ t: "attach", consoleId: node.id });
  // the stub prints its version whatever the arguments, so this output proves the stub ran, not a real claude
  await until(() => sock.output(node.id).includes("9.9.9 (stub)"));
  const agents = await until(async () => {
    const list = (await d.call("GET", "/api/agents")).body as { id: string; version: string | null }[];
    return list.find((a) => a.id === "claude" && a.version) && list;
  });
  expect(agents).toContainEqual({ id: "claude", command: "claude", version: "9.9.9 (stub)", available: true });
});

test("an agent missing from agentPath is not spawned (D38)", async () => {
  const s = setup();
  const d = await start(s);
  const res = await d.call("POST", "/api/consoles", { agent: "codex", cwd: s.repo });
  expect(res).toEqual({ status: 400, body: { error: "codex is not on the agent PATH" } });
});

test("startDaemon itself honours AGENTBOARD_AGENT_PATH, so `agentboard start` scans it too (D38)", async () => {
  const s = setup();
  process.env.AGENTBOARD_AGENT_PATH = s.path;
  cleanup.push(() => void delete process.env.AGENTBOARD_AGENT_PATH);
  const d = await startDaemon({ repoPath: s.repo, home: s.home });
  cleanup.push(() => d.close());
  const res = await fetch(`${d.origin}/api/agents`, { headers: { "x-agentboard-token": d.token } });
  const list = (await res.json()) as { id: string; available: boolean }[];
  // only the stub claude is on that PATH; the login PATH's CLIs must not show
  expect(list.filter((a) => a.id !== "custom" && a.available).map((a) => a.id)).toEqual(["claude"]);
});

test("after /clear the console adopts the next session id once, then D34 guards the new one (D39)", async () => {
  const s = setup();
  const d = await start(s);
  // the stub claude from the agent PATH: it prints a version and exits, the node stays
  const node = (await d.call("POST", "/api/consoles", { agent: "claude", cwd: s.repo })).body as ConsoleNode;
  const first = node.session!.id;
  const session = async () => ((await d.call("GET", "/api/status")).body as { consoles: ConsoleNode[] }).consoles.find((c) => c.id === node.id)!.session!.id;
  const hook = (event: string, payload: object) => d.call("POST", `/hook/${node.id}`, { agent: "claude", event, payload });
  await hook("Stop", { session_id: "nested" });
  expect(await session()).toBe(first);
  await hook("SessionEnd", { session_id: first, reason: "clear" });
  await hook("UserPromptSubmit", { session_id: "after-clear" });
  expect(await session()).toBe("after-clear");
  await hook("Stop", { session_id: "nested-again" });
  expect(await session()).toBe("after-clear");
});

test("a spawn that cannot launch leaves no worktree behind", async () => {
  const s = setup();
  spawnSync("git", ["init", "-q", "-b", "main", s.repo]);
  spawnSync("git", ["-C", s.repo, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "init"]);
  const d = await start(s);
  const res = await d.call("POST", "/api/consoles", { agent: "codex", cwd: s.repo, worktree: "wt" });
  expect(res.status).toBe(400);
  expect(existsSync(join(s.repo, ".worktrees", "wt"))).toBe(false);
});

async function claudeConsole() {
  const s = setup();
  const d = await start(s);
  // the stub claude from the agent PATH prints a version and exits at once; the node stays
  const node = (await d.call("POST", "/api/consoles", { agent: "claude", cwd: s.repo })).body as ConsoleNode;
  const status = async () => ((await d.call("GET", "/api/status")).body as { consoles: ConsoleNode[] }).consoles.find((c) => c.id === node.id)!;
  const hook = (event: string, payload: object) => d.call("POST", `/hook/${node.id}`, { agent: "claude", event, payload });
  return { d, node, status, hook };
}

test("an exit ends a pending adoption, so after clear, exit and Resume a nested run cannot take the session (D39)", async () => {
  const { d, node, status, hook } = await claudeConsole();
  const first = node.session!.id;
  await hook("SessionEnd", { session_id: first, reason: "clear" });
  await until(async () => (await status()).status === "exited");
  expect((await d.call("POST", `/api/consoles/${node.id}/resume`)).status).toBe(200);
  await hook("Stop", { session_id: "nested" });
  expect((await status()).session!.id).toBe(first);
});

test("a SessionEnd clear from a foreign session arms nothing (D39)", async () => {
  const { node, status, hook } = await claudeConsole();
  const first = node.session!.id;
  await hook("SessionEnd", { session_id: "nested", reason: "clear" });
  await hook("Stop", { session_id: "other-nested" });
  expect((await status()).session!.id).toBe(first);
});

// Phase 5: the command bar's routes.
const spawnFake = (d: Awaited<ReturnType<typeof start>>, repo: string) =>
  d.call("POST", "/api/consoles", { agent: "custom", customId: "fake", cwd: repo }).then((r) => r.body as ConsoleNode);
const planOf = (steps: unknown[]) => ({ id: "p", text: "t", steps, plannedBy: "rules", ms: 1, reply: "ok" });

test("POST /api/command/plan plans 'fit all consoles'", async () => {
  const s = setup();
  const d = await start(s);
  const r = await d.call("POST", "/api/command/plan", { text: "fit all consoles", repo: s.repo });
  expect(r.status).toBe(200);
  expect((r.body as { steps: { kind: string; asks: boolean }[] }).steps).toMatchObject([{ kind: "fit", asks: false }]);
});

test("POST /api/command/run with a confirmed close removes the console", async () => {
  const s = setup();
  const d = await start(s);
  const c = await spawnFake(d, s.repo);
  const plan = planOf([{ id: "s1", kind: "close", consoleIds: [c.id], summary: "Close", asks: true }]);
  expect((await d.call("POST", "/api/command/run", { plan, confirmed: [], skipped: [] })).status).toBe(409);
  const r = await d.call("POST", "/api/command/run", { plan, confirmed: ["s1"], skipped: [] });
  expect(r.body).toMatchObject({ results: [{ stepId: "s1", status: "done" }] });
  const board = (await d.call("GET", `/api/board?repo=${encodeURIComponent(s.repo)}`)).body as Board;
  expect(consolesOf(board)).toEqual([]);
});

test("a spawn step with near lands right of that console", async () => {
  const s = setup();
  const d = await start(s);
  const a = await spawnFake(d, s.repo);
  const plan = planOf([{ id: "s1", kind: "spawn", agent: "custom", customId: "fake", near: a.id, summary: "Spawn", asks: false }]);
  const r = await d.call("POST", "/api/command/run", { plan, confirmed: [], skipped: [] });
  const id = (r.body as { results: { consoleId: string }[] }).results[0]!.consoleId;
  const board = (await d.call("GET", `/api/board?repo=${encodeURIComponent(s.repo)}`)).body as Board;
  const b = consolesOf(board).find((n) => n.id === id)!;
  expect(b).toMatchObject({ x: a.x + a.w + 40, y: a.y });
});

test("PUT /api/settings refuses a non-loopback planner URL", async () => {
  const s = setup();
  const d = await start(s);
  const put = (url: string) => d.call("PUT", "/api/settings", { fontSize: 13, customAgents: [], planner: { url, model: "m" } });
  expect((await put("http://example.com:11434")).status).toBe(400);
  for (const ok of ["http://localhost:11434", "http://127.0.0.1:11434", "http://[::1]:11434"]) expect((await put(ok)).status).toBe(200);
});

test("a second spawn near the same console skips the occupied slot", async () => {
  const s = setup();
  const d = await start(s);
  const a = await spawnFake(d, s.repo);
  const run = async (id: string) => {
    const plan = planOf([{ id, kind: "spawn", agent: "custom", customId: "fake", near: a.id, summary: "Spawn", asks: false }]);
    const r = await d.call("POST", "/api/command/run", { plan, confirmed: [], skipped: [] });
    return (r.body as { results: { consoleId: string }[] }).results[0]!.consoleId;
  };
  const [first, second] = [await run("s1"), await run("s2")];
  const board = (await d.call("GET", `/api/board?repo=${encodeURIComponent(s.repo)}`)).body as Board;
  const at = (id: string) => consolesOf(board).find((n) => n.id === id)!;
  expect(at(first).x).toBe(a.x + a.w + 40);
  expect(at(second).x).toBe(a.x + 2 * (a.w + 40));
});

test("a confirmed input step types text and Enter into the console; a console that is not running fails the step", async () => {
  const s = setup();
  const d = await start(s);
  const sock = socket(d);
  await sock.opened;
  const c = await spawnFake(d, s.repo);
  sock.send({ t: "attach", consoleId: c.id });
  await until(() => sock.output(c.id).includes("fake>"));
  const plan = planOf([
    { id: "s1", kind: "input", consoleId: c.id, text: "hi there", summary: "Type", asks: true },
    { id: "s2", kind: "input", consoleId: "not-running", text: "x", summary: "Type", asks: true },
  ]);
  const r = await d.call("POST", "/api/command/run", { plan, confirmed: ["s1", "s2"], skipped: [] });
  expect(r.body).toMatchObject({ results: [{ stepId: "s1", status: "done" }, { stepId: "s2", status: "failed", error: expect.stringContaining("not running") }] });
  await until(() => sock.output(c.id).includes("you said: hi there"));
});

test("a note step lands on the active workspace", async () => {
  const s = setup();
  const d = await start(s);
  const plan = planOf([{ id: "s1", kind: "note", text: "remember", summary: "Note", asks: false }]);
  expect((await d.call("POST", "/api/command/run", { plan, confirmed: [], skipped: [] })).body).toMatchObject({ results: [{ status: "done" }] });
  const board = (await d.call("GET", `/api/board?repo=${encodeURIComponent(s.repo)}`)).body as Board;
  const ws = board.workspaces.find((w) => w.id === board.activeWorkspaceId)!;
  expect(ws.nodes).toMatchObject([{ type: "note", text: "remember" }]);
});

test("an input step turns a heuristic console working", async () => {
  const s = setup();
  const d = await start(s);
  const sock = socket(d);
  await sock.opened;
  const c = await spawnFake(d, s.repo);
  sock.send({ t: "attach", consoleId: c.id });
  await until(() => sock.output(c.id).includes("fake>"));
  const plan = planOf([{ id: "s1", kind: "input", consoleId: c.id, text: "go", summary: "Type", asks: true }]);
  await d.call("POST", "/api/command/run", { plan, confirmed: ["s1"], skipped: [] });
  await until(async () => ((await d.call("GET", "/api/status")).body as { consoles: ConsoleNode[] }).consoles.find((x) => x.id === c.id && x.status === "working"));
});

test("two note steps in one plan land on different cells", async () => {
  const s = setup();
  const d = await start(s);
  const plan = planOf([
    { id: "s1", kind: "note", text: "one", summary: "Note", asks: false },
    { id: "s2", kind: "note", text: "two", summary: "Note", asks: false },
  ]);
  await d.call("POST", "/api/command/run", { plan, confirmed: [], skipped: [] });
  const board = (await d.call("GET", `/api/board?repo=${encodeURIComponent(s.repo)}`)).body as Board;
  const [a, b] = board.workspaces.find((w) => w.id === board.activeWorkspaceId)!.nodes;
  expect([a!.x, a!.y]).not.toEqual([b!.x, b!.y]);
});

test("a note step with repo lands on that repo's board, not the start board", async () => {
  const s = setup();
  const d = await start(s);
  const other = join(dirname(s.repo), "other");
  mkdirSync(other);
  const plan = planOf([{ id: "s1", kind: "note", text: "elsewhere", summary: "Note", asks: false }]);
  await d.call("POST", "/api/command/run", { plan, confirmed: [], skipped: [], repo: other });
  const notes = async (repo: string) => {
    const board = (await d.call("GET", `/api/board?repo=${encodeURIComponent(repo)}`)).body as Board;
    return board.workspaces.flatMap((w) => w.nodes).filter((n) => n.type === "note");
  };
  expect(await notes(other)).toHaveLength(1);
  expect(await notes(s.repo)).toHaveLength(0);
});

test("a handoff drafted from a live fake console is saved as markdown with no home path", async () => {
  const s = setup();
  const d = await start(s);
  const sock = socket(d);
  await sock.opened;
  const node = (await d.call("POST", "/api/consoles", { agent: "custom", customId: "fake", cwd: s.repo })).body as ConsoleNode;
  sock.send({ t: "attach", consoleId: node.id });
  await until(() => sock.output(node.id).includes("fake>"));
  sock.send({ t: "input", consoleId: node.id, data: `I decided to use ${homedir()}/scratch for notes.\r` });
  await until(() => sock.output(node.id).includes("you said: I decided"));
  const { status, body } = await d.call("POST", "/api/handoffs", { fromConsoleId: node.id });
  expect(status).toBe(200);
  const h = body as { id: string; promptText: string };
  const md = readFileSync(join(s.home, "handoffs", `${h.id}.md`), "utf8");
  expect(md).toBe(h.promptText);
  expect(md.split("\n")[0]).toBe("Brief from Fake follows.");
  expect(md).toContain("~/scratch for notes.");
  expect(md).not.toContain(homedir());
  expect(((await d.call("GET", `/api/handoffs?console=${node.id}`)).body as { id: string }[]).map((x) => x.id)).toEqual([h.id]);
});
