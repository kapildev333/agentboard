import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { noteCommand } from "../src/commands/note.js";
import { statusCommand } from "../src/commands/status.js";

const box = { x: 0, w: 300, h: 200 };
const board = {
  version: 1,
  repoPath: "/r",
  activeWorkspaceId: "w2",
  workspaces: [
    {
      id: "w1",
      name: "main",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { ...box, id: "c1", type: "console", title: "claude", y: 100, agent: "claude", cwd: "/r", status: "idle", createdAt: "t", lastActiveAt: "t" },
      ],
    },
    {
      id: "w2",
      name: "second",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { ...box, id: "n1", type: "note", title: "note", text: "old", y: 500, h: 100 },
        { ...box, id: "n2", type: "note", title: "note", text: "high", x: -20, y: 0, h: 100 },
        // the largest y but not the lowest bottom, so max(y) + h cannot pass for max(y + h) (L23)
        { ...box, id: "n3", type: "note", title: "note", text: "low", y: 520, h: 10 },
      ],
    },
  ],
};

const repoDir = mkdtempSync(join(tmpdir(), "ab-repo-"));
let current: typeof board;
let server: Server;
let put: unknown;
let getUrl: string | undefined;
beforeEach(async () => {
  const home = mkdtempSync(join(tmpdir(), "ab-cli-"));
  process.env.AGENTBOARD_HOME = home;
  put = undefined;
  getUrl = undefined;
  current = structuredClone(board);
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "PUT") {
        put = JSON.parse(body);
        return res.end(JSON.stringify({ ok: true }));
      }
      if (req.url?.startsWith("/api/board")) getUrl = req.url;
      res.end(JSON.stringify(req.url === "/api/status" ? { consoles: board.workspaces[0]!.nodes } : current));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port, token: "tok", pid: 4242 }));
});
afterEach(() => {
  delete process.env.AGENTBOARD_HOME;
  server.close();
});

test("note appends a node through GET and PUT", async () => {
  const lines: string[] = [];
  expect(await noteCommand(["remember", "this", "--repo", repoDir], { log: (s) => lines.push(s) })).toBe(0);
  expect(getUrl).toBe(`/api/board?repo=${encodeURIComponent(repoDir)}`);
  const saved = (put as typeof board).workspaces;
  expect(saved[0]!.nodes).toHaveLength(1); // the inactive workspace is untouched
  const nodes = saved[1]!.nodes;
  expect(nodes).toHaveLength(4);
  const added = nodes[3] as unknown as { id: string; type: string; text: string; y: number };
  expect(added).toMatchObject({ type: "note", text: "remember this" });
  // leftmost x (-20, not 0) and lowest bottom (600, not 100) plus the 40 gap
  expect(added).toMatchObject({ x: -20, y: 640 });
  expect(JSON.parse(lines[0]!)).toEqual({ id: added.id });
});

test("status --json lists consoles", async () => {
  const lines: string[] = [];
  expect(await statusCommand(["--json"], (s) => lines.push(s))).toBe(0);
  expect(JSON.parse(lines[0]!)).toEqual({
    alive: true,
    port: expect.any(Number),
    pid: 4242,
    consoles: [{ id: "c1", title: "claude", agent: "claude", status: "idle" }],
  });
});

test("note defaults to the main repo root from a subdirectory", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ab-repo-")));
  execFileSync("git", ["init", "-q", root]);
  const sub = join(root, "a", "b");
  mkdirSync(sub, { recursive: true });
  expect(await noteCommand(["hi"], { cwd: sub, log: () => {} })).toBe(0);
  expect(getUrl).toBe(`/api/board?repo=${encodeURIComponent(root)}`);
});

test("note defaults to the main repo root from a linked worktree", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ab-repo-")));
  const linked = join(realpathSync(mkdtempSync(join(tmpdir(), "ab-wt-"))), "wt");
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: root });
  execFileSync("git", ["worktree", "add", "-q", linked, "-b", "wt"], { cwd: root });
  expect(await noteCommand(["hi"], { cwd: linked, log: () => {} })).toBe(0);
  expect(getUrl).toBe(`/api/board?repo=${encodeURIComponent(root)}`);
});

test("note with no text prints a usage error and returns 1", async () => {
  const lines: string[] = [];
  expect(await noteCommand([], { log: (s) => lines.push(s) })).toBe(1);
  expect(JSON.parse(lines[0]!).error).toMatch(/usage/);
  expect(put).toBeUndefined();
});

test("note outside a git repo defaults to the current directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ab-plain-"));
  expect(await noteCommand(["hi"], { cwd: dir, log: () => {} })).toBe(0);
  expect(getUrl).toBe(`/api/board?repo=${encodeURIComponent(dir)}`);
});

test("note on an empty active workspace is placed at the origin", async () => {
  current.workspaces[1]!.nodes = [];
  expect(await noteCommand(["first", "--repo", repoDir], { log: () => {} })).toBe(0);
  expect((put as typeof board).workspaces[1]!.nodes[0]).toMatchObject({ x: 0, y: 0, text: "first" });
});

test("note --repo . resolves to the current directory", async () => {
  expect(await noteCommand(["hi", "--repo", "."], { log: () => {} })).toBe(0);
  expect(getUrl).toBe(`/api/board?repo=${encodeURIComponent(process.cwd())}`);
});

test("note inside a git submodule defaults to the submodule root", async () => {
  const git = (cwd: string, ...a: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "protocol.file.allow=always", ...a], { cwd, stdio: "ignore" });
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ab-sub-")));
  const lib = join(dir, "lib");
  const parent = join(dir, "parent");
  for (const d of [lib, parent]) {
    execFileSync("git", ["init", "-q", d]);
    git(d, "commit", "-q", "--allow-empty", "-m", "init");
  }
  git(parent, "submodule", "add", "-q", lib, "sub");
  expect(await noteCommand(["hi"], { cwd: join(parent, "sub"), log: () => {} })).toBe(0);
  expect(getUrl).toBe(`/api/board?repo=${encodeURIComponent(join(parent, "sub"))}`);
});

test("note with a missing --repo fails before reaching for a daemon (L23)", async () => {
  const lines: string[] = [];
  expect(await noteCommand(["hi", "--repo", join(repoDir, "missing")], { log: (s) => lines.push(s) })).toBe(1);
  expect(JSON.parse(lines[0]!).error).toMatch(/^not a directory: /);
  expect(getUrl).toBeUndefined();
});
