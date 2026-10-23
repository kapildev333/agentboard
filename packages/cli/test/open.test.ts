import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { openCommand } from "../src/commands/open.js";

const noSpawn = (() => {
  throw new Error("must not spawn");
}) as never;

let server: Server;
let home: string;
const token = "tok";
const code = "c0+de/=";

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "ab-cli-"));
  process.env.AGENTBOARD_HOME = home;
  server = createServer((req, res) => {
    const ok = req.headers["x-agentboard-token"] === token;
    res.statusCode = ok ? 200 : 401;
    res.end(ok && req.method === "POST" && req.url === "/auth/code" ? JSON.stringify({ code }) : "{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
});
afterEach(() => {
  delete process.env.AGENTBOARD_HOME;
  server.close();
});

test("open with no daemon spawns one and prints the URL", async () => {
  const port = (server.address() as AddressInfo).port;
  const spawned: string[][] = [];
  const options: unknown[] = [];
  let unrefs = 0;
  const spawn = ((cmd: string, args: string[], opts: unknown) => {
    spawned.push([cmd, ...args]);
    options.push(opts);
    writeFileSync(join(home, "daemon.json"), JSON.stringify({ port, token, pid: process.pid }));
    return { unref: () => unrefs++, on() {} };
  }) as never;
  const opened: string[] = [];
  const lines: string[] = [];
  const repo = join(home, "some repo");
  mkdirSync(repo);
  await openCommand([repo], { spawn, openBrowser: (u) => opened.push(u), log: (s) => lines.push(s) });
  const url = `http://127.0.0.1:${port}/?code=${encodeURIComponent(code)}&repo=${encodeURIComponent(repo)}`;
  expect(spawned).toHaveLength(1);
  expect(spawned[0]).toContain("start");
  expect(options[0]).toMatchObject({ cwd: repo, detached: true, stdio: "ignore", windowsHide: true });
  expect(unrefs).toBe(1);
  expect(opened).toEqual([url]);
  expect(lines).toEqual([url]);
});

test("open fails with one line when the path is not a directory", async () => {
  await expect(openCommand([join(home, "missing")], { spawn: noSpawn, openBrowser: () => {}, log: () => {} })).rejects.toThrow(
    /not a directory/,
  );
});

test("the default opener swallows a missing open command", async () => {
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port: (server.address() as AddressInfo).port, token, pid: 1 }));
  const handlers: Record<string, () => void> = {};
  const opts: unknown[] = [];
  let unrefs = 0;
  const spawn = ((_c: string, _a: string[], o: unknown) => (opts.push(o), { unref: () => unrefs++, on: (e: string, f: () => void) => (handlers[e] = f) })) as never;
  await openCommand([home], { spawn, log: () => {} });
  expect(opts[0]).toMatchObject({ detached: true, stdio: "ignore", windowsHide: true });
  expect(unrefs).toBe(1);
  expect(() => handlers.error?.()).not.toThrow();
  expect(handlers.error).toBeDefined();
});

test("open exchanges the token for a code and never puts the token in the URL", async () => {
  const port = (server.address() as AddressInfo).port;
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port, token, pid: 1 }));
  const lines: string[] = [];
  await openCommand([home], { spawn: noSpawn, openBrowser: () => {}, log: (s) => lines.push(s) });
  expect(lines[0]).toBe(`http://127.0.0.1:${port}/?code=${encodeURIComponent(code)}&repo=${encodeURIComponent(home)}`);
  expect(lines[0]).not.toContain(token);
});

test("open replaces a stale daemon.json by spawning once and using the new token", async () => {
  const port = (server.address() as AddressInfo).port;
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port, token: "stale", pid: 1 }));
  let spawns = 0;
  const spawn = (() => {
    spawns++;
    setTimeout(() => writeFileSync(join(home, "daemon.json"), JSON.stringify({ port, token, pid: 1 })), 300);
    return { unref() {}, on() {} };
  }) as never;
  const lines: string[] = [];
  await openCommand([home], { spawn, openBrowser: () => {}, log: (s) => lines.push(s) });
  expect(spawns).toBe(1);
  expect(lines[0]).toContain(`code=${encodeURIComponent(code)}`);
});

test("open fails when the daemon refuses the login code", async () => {
  const old = createServer((req, res) => { res.statusCode = req.url === "/auth/code" ? 404 : 200; res.end(); });
  await new Promise<void>((r) => old.listen(0, "127.0.0.1", r));
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port: (old.address() as AddressInfo).port, token, pid: 1 }));
  await expect(openCommand([home], { spawn: noSpawn, openBrowser: () => {}, log: () => {} })).rejects.toThrow(/refused the login code/);
  old.close();
});
