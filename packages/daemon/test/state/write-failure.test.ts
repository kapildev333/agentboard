import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { boardPath, DaemonFile, daemonFilePath, StateStore } from "../../src/state/index.js";

let failRename = false;
vi.mock("node:fs/promises", async (orig) => {
  const m = await orig<typeof import("node:fs/promises")>();
  return { ...m, rename: (...a: Parameters<typeof m.rename>) => (failRename ? Promise.reject(new Error("boom")) : m.rename(...a)) };
});

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agentboard-"));
  process.env.AGENTBOARD_HOME = home;
});
afterEach(async () => {
  failRename = false;
  vi.useRealTimers();
  delete process.env.AGENTBOARD_HOME;
  await rm(home, { recursive: true, force: true });
});

const note = { id: "n1", type: "note", title: "t", x: 1, y: 2, w: 3, h: 4, text: "hi" } as const;

test("a failed rename leaves the previous board intact and the new one pending", async () => {
  const store = new StateStore();
  const board = await store.load("/repo/a");
  await store.save(board);
  await store.flush();
  const before = await readFile(boardPath("/repo/a"), "utf8");
  board.workspaces[0]!.nodes.push({ ...note });
  await store.save(board);
  failRename = true;
  await expect(store.flush()).rejects.toThrow("boom");
  expect(await readFile(boardPath("/repo/a"), "utf8")).toBe(before);
  failRename = false;
  await store.flush();
  expect(await new StateStore().load("/repo/a")).toEqual(board);
});

test("a timer-driven write error is not an unhandled rejection and keeps the board", async () => {
  vi.useFakeTimers();
  const store = new StateStore();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  failRename = true;
  await store.save(await store.load("/repo/a"));
  await vi.advanceTimersByTimeAsync(300);
  await vi.waitFor(() => expect(log).toHaveBeenCalled());
  failRename = false;
  await store.flush();
  expect((await new StateStore().load("/repo/a")).repoPath).toBe("/repo/a");
});

test("a failed daemon file write leaves the previous file intact", async () => {
  const file = new DaemonFile();
  await file.write({ port: 1, token: "t", pid: 2 });
  failRename = true;
  await expect(file.write({ port: 9, token: "u", pid: 3 })).rejects.toThrow("boom");
  expect(JSON.parse(await readFile(daemonFilePath(), "utf8")).port).toBe(1);
});
