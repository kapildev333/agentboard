import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import WebSocket from "ws";
import type { Board, ConsoleNode, DaemonMessage, Loop } from "@agentboard/shared";
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

test("a loop runs twice against the fake agent and its second prompt says run 2", async () => {
  const s = setup();
  // claude's hooks give the test the status edges; the console itself is the fake agent
  writeFileSync(join(s.path, "claude"), `#!/bin/sh\n[ "$1" = --version ] && { echo '9.9.9 (stub)'; exit 0; }\nexec '${process.execPath}' '${fakeAgent}'\n`);
  const d = await start(s);
  const sock = socket(d);
  await sock.opened;
  const node = (await d.call("POST", "/api/consoles", { agent: "claude", cwd: s.repo })).body as ConsoleNode;
  sock.send({ t: "attach", consoleId: node.id });
  await until(() => sock.output(node.id).includes("fake>"));
  const hook = (event: string) => d.call("POST", `/hook/${node.id}`, { agent: "claude", event, payload: { session_id: node.session!.id } });
  const req = { consoleId: node.id, name: "twice", trigger: { kind: "idle", delaySec: 0 }, stop: { maxRuns: 2 }, prompt: "Run {run} toward {goal}" };
  const created = await d.call("POST", "/api/loops", req);
  expect(created.status).toBe(200);
  const id = (created.body as Loop).id;
  for (const n of [1, 2]) {
    await hook("Stop");
    await until(() => sock.output(node.id).includes(`you said: Run ${n} toward`));
    await hook("UserPromptSubmit");
  }
  await hook("Stop");
  const loop = await until(async () => ((await d.call("GET", "/api/loops")).body as Loop[]).find((l) => l.id === id && l.state === "retired"));
  expect(loop.runs.map((r) => [r.n, r.outcome])).toEqual([[1, "idle"], [2, "idle · max runs"]]);
  expect(sock.messages.some((m) => m.t === "event" && m.event.kind === "loop" && m.event.detail === "retired: max runs")).toBe(true);
  expect((await d.call("POST", `/api/loops/${id}/resume`)).status).toBe(409);
  expect((await d.call("DELETE", `/api/loops/${id}`)).body).toEqual({ ok: true });
  expect((await d.call("POST", `/api/loops/${id}/run`)).status).toBe(404);
  await until(() => readFileSync(join(s.home, "loops.json"), "utf8") === "[]");
});
