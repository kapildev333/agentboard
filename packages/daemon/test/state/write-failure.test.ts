import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { boardPath, DaemonFile, daemonFilePath, StateStore } from "../../src/state/index.js";

let failRename = false;
let beforeRename: (() => Promise<void>) | null = null;
vi.mock("node:fs/promises", async (orig) => {
  const m = await orig<typeof import("node:fs/promises")>();
  return { ...m, rename: async (...a: Parameters<typeof m.rename>) => {
      await beforeRename?.();
      if (failRename) throw new Error("boom");
      return m.rename(...a);
    },
  };
});

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agentboard-"));
  process.env.AGENTBOARD_HOME = home;
});
afterEach(async () => {
  failRename = false;
  beforeRename = null;
  vi.useRealTimers();
  delete process.env.AGENTBOARD_HOME;
  await rm(home, { recursive: true, force: true });
});

const note = { id: "n1", type: "note", title: "t", x: 1, y: 2, w: 3, h: 4, text: "hi" } as const;

test("an interrupted write leaves the previous file intact", async () => {
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
  const board = await store.load("/repo/a");
  board.workspaces[0]!.nodes.push({ ...note });
  await store.save(board);
  await vi.advanceTimersByTimeAsync(300);
  await vi.waitFor(() => expect(log).toHaveBeenCalled());
  failRename = false;
  await store.flush();
  expect(await new StateStore().load("/repo/a")).toEqual(board);
});

test("a failed daemon file write leaves the previous file intact", async () => {
  const file = new DaemonFile();
  await file.write({ port: 1, token: "t", pid: 2 });
  failRename = true;
  await expect(file.write({ port: 9, token: "u", pid: 3 })).rejects.toThrow("boom");
  expect(JSON.parse(await readFile(daemonFilePath(), "utf8")).port).toBe(1);
});

test("an in-place edit made while the write is in flight is written by the next flush", async () => {
  const store = new StateStore();
  const board = await store.load("/repo/a");
  await store.save(board);
  let reached!: () => void;
  const atRename = new Promise<void>((r) => (reached = r));
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  beforeRename = async () => {
    reached();
    await gate;
  };
  const first = store.flush();
  await atRename;
  beforeRename = null;
  const same = await store.load("/repo/a");
  same.workspaces[0]!.nodes.push({ ...note });
  await store.save(same);
  release();
  await first;
  await store.flush();
  expect((await new StateStore().load("/repo/a")).workspaces[0]!.nodes).toHaveLength(1);
});
