import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { handleOpen, openIn } from "../../src/open/index.js";

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
    // D23: on macOS Finder reveals the folder in its parent and never launches a bundle.
    { command: "open", args: ["-R", dir] },
  ]);
});

test("finder opens the folder on linux and windows", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ab-open-"));
  const { spawn, calls } = fakeSpawn();
  await openIn("finder", dir, spawn, "linux");
  await openIn("finder", dir, spawn, "win32");
  expect(calls).toEqual([
    { command: "xdg-open", args: [dir] },
    { command: "explorer", args: [dir] },
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

test("handleOpen checks the body shape and returns ok", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ab-open-"));
  const { spawn, calls } = fakeSpawn();
  await expect(handleOpen({ editor: "vim", path: dir }, spawn)).rejects.toThrow(/unknown editor/);
  await expect(handleOpen({ editor: "code" }, spawn)).rejects.toThrow(/path must be a string/);
  await expect(handleOpen(null, spawn)).rejects.toThrow(/unknown editor/);
  expect(calls).toEqual([]);
  expect(await handleOpen({ editor: "code", path: dir }, spawn)).toEqual({ ok: true });
  expect(calls).toEqual([{ command: "code", args: [dir] }]);
});

test("a missing binary rejects with a one-line message", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ab-open-"));
  const spawn = (command: string) => {
    const child = Object.assign(new EventEmitter(), { unref() {} });
    process.nextTick(() => child.emit("error", new Error(`spawn ${command} ENOENT`)));
    return child;
  };
  const err = await openIn("zed", dir, spawn).catch((e: Error) => e);
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).message).toBe("could not start zed: spawn zed ENOENT");
  expect((err as Error).message).not.toContain("\n");
});
