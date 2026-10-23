import { mkdtempSync, writeFileSync } from "node:fs";
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
  const spawn = ((cmd: string, args: string[]) => {
    spawned.push([cmd, ...args]);
    writeFileSync(join(home, "daemon.json"), JSON.stringify({ port, token, pid: process.pid }));
    return { unref() {} };
  }) as never;
  const opened: string[] = [];
  const lines: string[] = [];
  await openCommand(["/some repo"], { spawn, openBrowser: (u) => opened.push(u), log: (s) => lines.push(s) });
  const url = `http://127.0.0.1:${port}/?token=${token}&repo=${encodeURIComponent("/some repo")}`;
  expect(spawned).toHaveLength(1);
  expect(spawned[0]).toContain("start");
  expect(opened).toEqual([url]);
  expect(lines).toEqual([url]);
});
