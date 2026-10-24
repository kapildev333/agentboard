import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { Loop } from "@agentboard/shared";
import { LoopStore } from "../../src/loops/store.js";

const fixture = JSON.parse(readFileSync(new URL("../../../shared/src/fixtures/loop.json", import.meta.url), "utf8")) as Loop;
let home = "";
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env.AGENTBOARD_HOME;
  vi.restoreAllMocks();
});
const useHome = () => (process.env.AGENTBOARD_HOME = home = mkdtempSync(join(tmpdir(), "agentboard-loops-")));

test("loops saved to loops.json load back", async () => {
  useHome();
  const store = new LoopStore();
  expect(await store.load()).toEqual([]);
  await store.save([fixture]);
  expect(await new LoopStore().load()).toEqual([fixture]);
});

test("a corrupt loops.json is set aside and an empty list loads", async () => {
  useHome();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  writeFileSync(join(home, "loops.json"), "{not json");
  expect(await new LoopStore().load()).toEqual([]);
  const aside = readdirSync(home).filter((f) => f.startsWith("loops.json.corrupt-"));
  expect(aside).toHaveLength(1);
  expect(readFileSync(join(home, aside[0]!), "utf8")).toBe("{not json");
  expect(error).toHaveBeenCalled();
});
