import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { StateStore } from "../../src/state/index.js";

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
