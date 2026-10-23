import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { boardPath, migrate, StateStore } from "../../src/state/index.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agentboard-"));
  process.env.AGENTBOARD_HOME = home;
});
afterEach(async () => {
  vi.useRealTimers();
  delete process.env.AGENTBOARD_HOME;
  await rm(home, { recursive: true, force: true });
});

test("save then load returns an equal board", async () => {
  const store = new StateStore();
  const board = await store.load("/repo/a");
  board.workspaces[0]!.nodes.push({ id: "n1", type: "note", title: "t", x: 1, y: 2, w: 3, h: 4, text: "hi" });
  await store.save(board);
  await store.flush();
  expect(await new StateStore().load("/repo/a")).toEqual(board);
});

test("a version-0 document migrates to version 1", () => {
  const note = { id: "n1", type: "note", title: "t", x: 1, y: 2, w: 3, h: 4, text: "hi" };
  const board = migrate({ repoPath: "/repo/a", nodes: [note] });
  expect(board).toEqual({
    version: 1,
    repoPath: "/repo/a",
    activeWorkspaceId: "main",
    workspaces: [{ id: "main", name: "main", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [note] }],
  });
});

test("load rejects a file that fails BoardSchema with a clear error", async () => {
  const file = boardPath("/repo/a");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ version: 1, repoPath: "/repo/a" }));
  await expect(new StateStore().load("/repo/a")).rejects.toThrow(/invalid board file .*\.json/);
});

const note = { id: "n1", type: "note", title: "t", x: 1, y: 2, w: 3, h: 4, text: "hi" } as const;

test("save writes after the 300 ms debounce, not before", async () => {
  vi.useFakeTimers();
  const store = new StateStore();
  await store.save(await store.load("/repo/a"));
  await vi.advanceTimersByTimeAsync(299);
  expect(vi.getTimerCount()).toBe(1);
  expect(existsSync(boardPath("/repo/a"))).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  await vi.waitFor(() => expect(existsSync(boardPath("/repo/a"))).toBe(true));
});

test("flush after the timer fired waits for that write", async () => {
  vi.useFakeTimers();
  const store = new StateStore();
  await store.save(await store.load("/repo/a"));
  await vi.advanceTimersByTimeAsync(300);
  await store.flush();
  expect(existsSync(boardPath("/repo/a"))).toBe(true);
});

test("overlapping flushes leave a valid file", async () => {
  const store = new StateStore();
  const board = await store.load("/repo/a");
  board.workspaces[0]!.nodes.push({ ...note, text: "x".repeat(2_000_000) });
  await store.save(board);
  await Promise.all([store.flush(), store.flush(), store.flush()]);
  expect(await new StateStore().load("/repo/a")).toEqual(board);
});

test("saves for two repos within the debounce both get written", async () => {
  const store = new StateStore();
  const a = await store.load("/repo/a");
  const b = await store.load("/repo/b");
  a.workspaces[0]!.nodes.push({ ...note });
  await store.save(a);
  await store.save(b);
  await store.flush();
  expect(await new StateStore().load("/repo/a")).toEqual(a);
  expect(await new StateStore().load("/repo/b")).toEqual(b);
});

test("load returns the pending board before it is flushed", async () => {
  const store = new StateStore();
  const board = await store.load("/repo/a");
  board.workspaces[0]!.nodes.push({ ...note });
  await store.save(board);
  expect(await store.load("/repo/a")).toEqual(board);
});

test("directories are created with mode 700", async () => {
  process.env.AGENTBOARD_HOME = join(home, "nested");
  const store = new StateStore();
  await store.save(await store.load("/repo/a"));
  await store.flush();
  expect((await stat(join(home, "nested"))).mode & 0o777).toBe(0o700);
  expect((await stat(dirname(boardPath("/repo/a")))).mode & 0o777).toBe(0o700);
});

test("migrate falls back to the given repoPath for a version-0 document without one", async () => {
  expect(migrate({ nodes: [] }, "/repo/a").repoPath).toBe("/repo/a");
  const file = boardPath("/repo/a");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ nodes: [note] }));
  expect((await new StateStore().load("/repo/a")).repoPath).toBe("/repo/a");
});

test("load names the file when the JSON is corrupt", async () => {
  const file = boardPath("/repo/a");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, '{"version":1,"repo');
  await expect(new StateStore().load("/repo/a")).rejects.toThrow(/invalid board file .*\.json/);
});
