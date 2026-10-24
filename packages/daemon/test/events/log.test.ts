import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { EventLog } from "../../src/events/index.js";

const home = () => mkdtempSync(join(tmpdir(), "agentboard-events-"));
const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);

test("append then list returns the event with an id and a timestamp", () => {
  const log = new EventLog(home());
  const e = log.append({ kind: "spawn", detail: "Fake started", consoleId: "c1" });
  expect(e.id).toBeTruthy();
  expect(Date.parse(e.ts)).not.toBeNaN();
  expect(log.list()).toEqual([e]);
  const files = readdirSync(log.dir);
  expect(files).toEqual([`${day(0)}.jsonl`]);
  expect(JSON.parse(readFileSync(join(log.dir, files[0]!), "utf8").trim())).toEqual(e);
});

test("a day file dated 8 days ago is pruned on construction and yesterday's stays", () => {
  const h = home();
  const dir = join(h, "events");
  mkdirSync(dir);
  for (const n of [8, 1]) writeFileSync(join(dir, `${day(n)}.jsonl`), "");
  new EventLog(h);
  expect(readdirSync(dir)).toEqual([`${day(1)}.jsonl`]);
});

test("list since an id returns only later events", () => {
  const log = new EventLog(home());
  const [a, b, c] = ["a", "b", "c"].map((detail) => log.append({ kind: "hook", detail }));
  expect(log.list({ since: a!.id })).toEqual([b, c]);
  expect(log.list({ limit: 2 })).toEqual([b, c]);
});
