import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import WebSocket from "ws";
import { createServer, type ServerOptions } from "../../src/server/index.js";

const token = "test-token";
const open: { close(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map((s) => s.close())); });

async function start(extra: Partial<ServerOptions> = {}) {
  const staticDir = mkdtempSync(join(tmpdir(), "agentboard-static-"));
  writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>board</title>");
  const s = await createServer({ port: 0, token, staticDir, routes: {}, ...extra });
  open.push(s);
  return s;
}

test("a request without the token is refused with 401", async () => {
  const s = await start();
  const res = await fetch(`${s.origin}/api/status`);
  expect(res.status).toBe(401);
  expect(await res.text()).toBe("");
});

test("a foreign Origin on a POST is refused with 403", async () => {
  const s = await start();
  const res = await fetch(`${s.origin}/hook/c1`, {
    method: "POST",
    headers: { "x-agentboard-token": token, origin: "https://evil.example", "content-type": "application/json" },
    body: JSON.stringify({ agent: "claude", event: "Stop" }),
  });
  expect(res.status).toBe(403);
});

function upgrade(url: string, headers: Record<string, string>) {
  return new Promise<{ opened: boolean; status?: number }>((resolve) => {
    const ws = new WebSocket(url, { headers });
    ws.on("open", () => { ws.close(); resolve({ opened: true }); });
    ws.on("unexpected-response", (_req, res) => resolve({ opened: false, status: res.statusCode }));
    ws.on("error", () => resolve({ opened: false }));
  });
}

test("a WebSocket upgrade from a foreign Origin is refused", async () => {
  const s = await start();
  const url = `${s.origin.replace("http", "ws")}/ws`;
  expect(await upgrade(url, { "x-agentboard-token": token, origin: "https://evil.example" }))
    .toEqual({ opened: false, status: 403 });
  expect(await upgrade(url, { "x-agentboard-token": token, origin: s.origin })).toEqual({ opened: true });
});

function get(port: number, path: string, headers: Record<string, string>) {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path, headers }, (res) => { res.resume(); resolve(res); }).on("error", reject);
  });
}

test("a wrong Host is refused with 403", async () => {
  const s = await start();
  expect((await get(s.port, "/api/status", { host: `evil.example:${s.port}`, "x-agentboard-token": token })).statusCode).toBe(403);
  expect((await get(s.port, "/api/status", { host: "localhost:1", "x-agentboard-token": token })).statusCode).toBe(403);
  expect((await get(s.port, "/", { host: `localhost:${s.port}`, "x-agentboard-token": token })).statusCode).not.toBe(403);
  expect(await upgrade(`ws://127.0.0.1:${s.port}/ws`, { host: `evil.example:${s.port}`, "x-agentboard-token": token }))
    .toEqual({ opened: false, status: 403 });
});
