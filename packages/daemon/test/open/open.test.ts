import { EventEmitter } from "node:events";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, expect, test } from "vitest";
import { OpenError, handleOpen, openIn, type Editor } from "../../src/open/index.js";

type Call = { command: string; args: readonly string[] };

// A child that reports a successful spawn on the next tick, so no editor ever opens.
function fakeSpawn() {
  const calls: Call[] = [];
  const options: unknown[] = [];
  const spawn = (command: string, args: readonly string[], opts: unknown) => {
    calls.push({ command, args });
    options.push(opts);
    const child = Object.assign(new EventEmitter(), { unref() {} });
    process.nextTick(() => child.emit("spawn"));
    return child;
  };
  return { spawn, calls, options };
}

const dirs: string[] = [];
afterAll(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

// macOS tmpdir sits under a symlink, so the spawned argv is the resolved path.
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "ab-open-"));
  dirs.push(d);
  return realpathSync(d);
}

test("openIn spawns the right command for each editor", async () => {
  const dir = tempDir();
  const { spawn, calls, options } = fakeSpawn();
  await openIn("code", dir, spawn);
  await openIn("zed", dir, spawn);
  await openIn("finder", dir, spawn, "darwin");
  expect(calls).toEqual([
    { command: "code", args: [dir] },
    { command: "zed", args: [dir] },
    // D23: on macOS Finder reveals the folder in its parent and never launches a bundle.
    { command: "open", args: ["-R", dir] },
  ]);
  expect(options).toEqual([
    { stdio: "ignore", detached: true },
    { stdio: "ignore", detached: true },
    { stdio: "ignore", detached: true },
  ]);
});

test("openIn refuses an editor outside the three before it touches the filesystem or spawns", async () => {
  const dir = tempDir();
  const { spawn, calls } = fakeSpawn();
  for (const name of ["constructor", "toString", "__proto__", "vim"]) {
    const editor: string = name;
    await expect(openIn(editor as Editor, dir, spawn)).rejects.toThrow(OpenError);
  }
  expect(calls).toEqual([]);
});

test("finder opens the folder on linux and windows", async () => {
  const dir = tempDir();
  const { spawn, calls } = fakeSpawn();
  await openIn("finder", dir, spawn, "linux");
  await openIn("finder", dir, spawn, "win32");
  expect(calls).toEqual([
    { command: "xdg-open", args: [dir] },
    { command: "explorer", args: [dir] },
  ]);
});

test("a path that is not a directory is rejected", async () => {
  const file = join(tempDir(), "a.txt");
  writeFileSync(file, "x");
  const { spawn, calls } = fakeSpawn();
  await expect(openIn("code", file, spawn)).rejects.toThrow(/not a directory/);
  await expect(openIn("code", join(tempDir(), "no-such-dir"), spawn)).rejects.toThrow(/not a directory/);
  expect(calls).toEqual([]);
});

test("handleOpen checks the body shape and returns ok", async () => {
  const dir = tempDir();
  const { spawn, calls } = fakeSpawn();
  await expect(handleOpen({ editor: "vim", path: dir }, spawn)).rejects.toThrow(/unknown editor/);
  await expect(handleOpen({ editor: "code" }, spawn)).rejects.toThrow(/path must be a string/);
  await expect(handleOpen(null, spawn)).rejects.toThrow(/unknown editor/);
  expect(calls).toEqual([]);
  expect(await handleOpen({ editor: "code", path: dir }, spawn)).toEqual({ ok: true });
  expect(calls).toEqual([{ command: "code", args: [dir] }]);
});

test("a relative path is refused, so no argv can be read as an option", async () => {
  const dir = tempDir();
  const { spawn, calls } = fakeSpawn();
  await expect(openIn("code", relative(process.cwd(), dir), spawn)).rejects.toThrow(/must be absolute/);
  expect(calls).toEqual([]);
});

test("a symlink is spawned as the directory it points to", async () => {
  const dir = tempDir();
  const link = join(tempDir(), "l");
  symlinkSync(dir, link);
  const { spawn, calls } = fakeSpawn();
  await openIn("code", link, spawn);
  expect(calls).toEqual([{ command: "code", args: [dir] }]);
});

test("errors stay on one line even for a path with a newline in it", async () => {
  const bad = join(tempDir(), "a\nb");
  const err = (await openIn("code", bad, fakeSpawn().spawn).catch((e: Error) => e)) as Error;
  expect(err.message).toMatch(/not a directory/);
  expect(err.message).not.toContain("\n");
});

test("client errors are OpenError, so L12 maps them to 400 without reading the message", async () => {
  const dir = tempDir();
  const { spawn } = fakeSpawn();
  const failures = [
    await handleOpen({ editor: "vim", path: dir }, spawn).catch((e: unknown) => e),
    await openIn("code", "relative", spawn).catch((e: unknown) => e),
    await openIn("code", join(dir, "missing"), spawn).catch((e: unknown) => e),
  ];
  for (const f of failures) expect(f).toBeInstanceOf(OpenError);
  const spawnFailure = await openIn("code", dir, () => {
    const child = Object.assign(new EventEmitter(), { unref() {} });
    process.nextTick(() => child.emit("error", new Error("spawn code ENOENT")));
    return child;
  }).catch((e: unknown) => e);
  expect(spawnFailure).not.toBeInstanceOf(OpenError);
});

test("a missing binary rejects with a one-line message", async () => {
  const dir = tempDir();
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
