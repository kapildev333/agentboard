import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { openIn } from "../../src/open/index.js";

type Call = { command: string; args: readonly string[] };

// A child that reports a successful spawn on the next tick, so no editor ever opens.
function fakeSpawn() {
  const calls: Call[] = [];
  const spawn = (command: string, args: readonly string[]) => {
    calls.push({ command, args });
    const child = Object.assign(new EventEmitter(), { unref() {} });
    process.nextTick(() => child.emit("spawn"));
    return child;
  };
  return { spawn, calls };
}

test("openIn spawns the right command for each editor", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ab-open-"));
  const { spawn, calls } = fakeSpawn();
  await openIn("code", dir, spawn);
  await openIn("zed", dir, spawn);
  await openIn("finder", dir, spawn, "darwin");
  expect(calls).toEqual([
    { command: "code", args: [dir] },
    { command: "zed", args: [dir] },
    { command: "open", args: [dir] },
  ]);
});

test("a path that is not a directory is rejected", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "ab-open-")), "a.txt");
  writeFileSync(file, "x");
  const { spawn, calls } = fakeSpawn();
  await expect(openIn("code", file, spawn)).rejects.toThrow(/not a directory/);
  await expect(openIn("code", join(tmpdir(), "ab-no-such-dir"), spawn)).rejects.toThrow(/not a directory/);
  expect(calls).toEqual([]);
});
