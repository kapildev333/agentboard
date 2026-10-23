import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { openCommand } from "../src/commands/open.js";

let server: Server;
let home: string;
const token = "tok";

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "ab-cli-"));
  process.env.AGENTBOARD_HOME = home;
  server = createServer((req, res) => {
    res.statusCode = req.headers["x-agentboard-token"] === token ? 200 : 401;
    res.end("{}");
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
  const url = `http://127.0.0.1:${port}/?token=${token}&repo=${encodeURIComponent(repo)}`;
  expect(spawned).toHaveLength(1);
  expect(spawned[0]).toContain("start");
  expect(options[0]).toMatchObject({ detached: true, stdio: "ignore" });
  expect(unrefs).toBe(1);
  expect(opened).toEqual([url]);
  expect(lines).toEqual([url]);
});

test("open fails with one line when the path is not a directory", async () => {
  const spawn = (() => {
    throw new Error("must not spawn");
  }) as never;
  await expect(openCommand([join(home, "missing")], { spawn, openBrowser: () => {}, log: () => {} })).rejects.toThrow(
    /not a directory/,
  );
});

test("the default opener swallows a missing open command", async () => {
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port: (server.address() as AddressInfo).port, token, pid: 1 }));
  const handlers: Record<string, () => void> = {};
  const spawn = (() => ({ unref() {}, on: (e: string, f: () => void) => (handlers[e] = f) })) as never;
  await openCommand([home], { spawn, log: () => {} });
  expect(() => handlers.error?.()).not.toThrow();
  expect(handlers.error).toBeDefined();
});

test("open URL-encodes the token", async () => {
  const odd = "a&b=c";
  server.close();
  server = createServer((_, res) => res.end("{}"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port, token: odd, pid: 1 }));
  const lines: string[] = [];
  await openCommand([home], { openBrowser: () => {}, log: (s) => lines.push(s) });
  expect(lines[0]).toContain(`token=${encodeURIComponent(odd)}&`);
});
