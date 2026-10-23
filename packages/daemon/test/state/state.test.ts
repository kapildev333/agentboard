import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { boardPath, migrate, StateStore } from "../../src/state/index.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agentboard-"));
  process.env.AGENTBOARD_HOME = home;
});
afterEach(async () => {
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

test("an interrupted write leaves the previous file intact", async () => {
  const store = new StateStore();
  const board = await store.load("/repo/a");
  await store.save(board);
  await store.flush();
  await writeFile(`${boardPath("/repo/a")}.tmp`, '{"version":1,"repo');
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
