import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { DaemonClient, readDaemonInfo } from "../src/client.js";

test("the client reads daemon.json from AGENTBOARD_HOME", () => {
  const home = mkdtempSync(join(tmpdir(), "ab-"));
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port: 5123, token: "t", pid: 7 }));
  expect(readDaemonInfo({ AGENTBOARD_HOME: home })).toEqual({ port: 5123, token: "t", pid: 7 });
});

test("a missing daemon.json fails the request, not construction", async () => {
  const home = mkdtempSync(join(tmpdir(), "ab-"));
  const client = new DaemonClient(() => readDaemonInfo({ AGENTBOARD_HOME: home }), (() => {
    throw new Error("no request expected");
  }) as typeof fetch, {});
  await expect(client.getStatus()).rejects.toThrow(/daemon\.json/);
});

test("daemon.json is re-read on every request", async () => {
  const home = mkdtempSync(join(tmpdir(), "ab-"));
  const urls: string[] = [];
  const f = (async (u: string) => (urls.push(u), new Response(JSON.stringify({ consoles: [] })))) as typeof fetch;
  const client = new DaemonClient(() => readDaemonInfo({ AGENTBOARD_HOME: home }), f, {});
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port: 1111, token: "a", pid: 1 }));
  await client.getStatus();
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port: 2222, token: "b", pid: 2 }));
  await client.getStatus();
  expect(urls).toEqual(["http://127.0.0.1:1111/api/status", "http://127.0.0.1:2222/api/status"]);
});

test("the MCP server and the CLI read daemon.json through one function (L24, L10)", async () => {
  const { loadDaemonInfo } = await import("@agentboard/cli");
  expect(readDaemonInfo).toBe(loadDaemonInfo);
});

test("note ids are unique within one millisecond (L24)", async () => {
  const board = { version: 1, repoPath: "/r", activeWorkspaceId: "w", workspaces: [{ id: "w", name: "w", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] }] };
  const f = (async (_: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "PUT" ? { ok: true } : board))) as typeof fetch;
  const client = new DaemonClient(() => ({ port: 1, token: "t", pid: 1 }), f, {});
  const now = Date.now;
  Date.now = () => 42;
  try {
    const [a, b] = [await client.addNote({ text: "a" }), await client.addNote({ text: "b" })];
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^note-[0-9a-f-]{36}$/);
  } finally {
    Date.now = now;
  }
});
