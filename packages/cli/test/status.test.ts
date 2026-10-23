import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { statusCommand } from "../src/commands/status.js";
import { readDaemonInfo } from "../src/daemonFile.js";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ab-cli-"));
  process.env.AGENTBOARD_HOME = home;
});
afterEach(() => delete process.env.AGENTBOARD_HOME);

test("status prints alive false and exits 1 with no daemon", async () => {
  const lines: string[] = [];
  expect(await statusCommand((s) => lines.push(s))).toBe(1);
  expect(JSON.parse(lines[0]!)).toEqual({ alive: false });
});

test("status prints the port and pid when the daemon answers", async () => {
  const server = createServer((_, res) => res.end("{}"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port, token: "t", pid: 4242 }));
  const lines: string[] = [];
  expect(await statusCommand((s) => lines.push(s))).toBe(0);
  server.close();
  expect(JSON.parse(lines[0]!)).toEqual({ alive: true, port, pid: 4242 });
});

test("readDaemonInfo rejects a malformed file", async () => {
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port: "x" }));
  expect(await readDaemonInfo()).toBeNull();
});
