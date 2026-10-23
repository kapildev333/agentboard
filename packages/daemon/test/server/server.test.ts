import http from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import WebSocket from "ws";
import { createServer, type ServerOptions } from "../../src/server/index.js";

const token = "test-token-0123456789abcdef0123456789abcdef";
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

test("the one-time query token becomes a cookie and the redirect drops it", async () => {
  const s = await start();
  const first = await fetch(`${s.origin}/?token=${token}&ws=1`, { redirect: "manual" });
  expect(first.status).toBe(302);
  expect(first.headers.get("location")).toBe("/?ws=1");
  const cookie = first.headers.get("set-cookie")!;
  expect(cookie).toMatch(new RegExp(`^agentboard=${token};`));
  expect(cookie).toMatch(/HttpOnly/);
  expect(cookie).toMatch(/SameSite=Strict/);
  expect(cookie).toMatch(/Path=\//);

  const page = await fetch(`${s.origin}/?ws=1`, { headers: { cookie: cookie.split(";")[0] } });
  expect(page.status).toBe(200);
  expect(page.headers.get("content-type")).toMatch(/text\/html/);
  expect(await page.text()).toContain("<title>board</title>");

  expect((await fetch(`${s.origin}/?token=wrong`, { redirect: "manual" })).status).toBe(401);
  expect((await fetch(`${s.origin}/api/status?token=${token}`)).status).toBe(401);
  expect((await fetch(`${s.origin}/`, { headers: { cookie: "agentboard=wrong" } })).status).toBe(401);
});

test("a valid request reaches its handler and the response is validated", async () => {
  const seen: unknown[] = [];
  const s = await start({
    routes: {
      "POST /hook/:consoleId": async (body, params) => { seen.push([params.consoleId, body]); return { ok: true }; },
      "GET /api/board": async (query) => { seen.push(query); return { version: 1 } as never; },
      "GET /api/status": async () => ({ consoles: [] }),
    },
  });
  const headers = { "x-agentboard-token": token, origin: s.origin, "content-type": "application/json" };
  const post = (body: string) => fetch(`${s.origin}/hook/c%201`, { method: "POST", headers, body });

  const ok = await post(JSON.stringify({ agent: "claude", event: "Stop" }));
  expect(ok.status).toBe(200);
  expect(ok.headers.get("content-type")).toMatch(/application\/json/);
  expect(await ok.json()).toEqual({ ok: true });
  expect(seen).toEqual([["c 1", { agent: "claude", event: "Stop" }]]);

  for (const body of [JSON.stringify({ agent: "vim", event: "Stop" }), "{not json"]) {
    const bad = await post(body);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid request" });
  }
  expect(seen).toHaveLength(1);

  expect((await fetch(`${s.origin}/api/board`, { headers })).status).toBe(400);
  const wrong = await fetch(`${s.origin}/api/board?repo=%2Ftmp%2Fr`, { headers });
  expect(seen[1]).toEqual({ repo: "/tmp/r" });
  expect(wrong.status).toBe(500);
  const text = await wrong.text();
  expect(JSON.parse(text)).toEqual({ error: "invalid response" });
  expect(text).not.toMatch(/at |ZodError/);

  expect(await (await fetch(`${s.origin}/api/status`, { headers })).json()).toEqual({ consoles: [] });
  expect((await fetch(`${s.origin}/api/agents`, { headers })).status).toBe(404);
});

test("no CORS header is ever present", async () => {
  const s = await start({ routes: { "GET /api/status": async () => ({ consoles: [] }) } });
  const evil = { origin: "https://evil.example" };
  const responses = [
    await fetch(`${s.origin}/api/status`, { headers: { ...evil, "x-agentboard-token": token } }),
    await fetch(`${s.origin}/api/status`, { headers: evil }),
    await fetch(`${s.origin}/api/status`, {
      method: "OPTIONS",
      headers: { ...evil, "access-control-request-method": "POST", "access-control-request-headers": "x-agentboard-token" },
    }),
    await fetch(`${s.origin}/?token=${token}`, { headers: evil, redirect: "manual" }),
    await fetch(`${s.origin}/`, { headers: { ...evil, "x-agentboard-token": token } }),
  ];
  expect(responses.map((r) => r.status)).toEqual([200, 401, 403, 302, 200]);
  for (const r of responses) expect([...r.headers.keys()].filter((k) => k.startsWith("access-control-"))).toEqual([]);
});

test("static files never leave staticDir", async () => {
  const base = mkdtempSync(join(tmpdir(), "agentboard-base-"));
  mkdirSync(join(base, "static"));
  writeFileSync(join(base, "static", "app.js"), "ok");
  writeFileSync(join(base, "secret.txt"), "secret");
  const s = await start({ staticDir: join(base, "static") });
  const headers = { host: `127.0.0.1:${s.port}`, "x-agentboard-token": token };
  expect((await get(s.port, "/app.js", headers)).statusCode).toBe(200);
  for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt", "/%2e%2e%2fsecret.txt"]) {
    expect((await get(s.port, path, headers)).statusCode).toBe(404);
  }
});

test("WebSocket messages dispatch to handlers and broadcast reaches attached sockets", async () => {
  const calls: unknown[] = [];
  const s = await start({
    onAttach: async (m, reply) => { calls.push(m); reply({ t: "output", consoleId: m.consoleId, data: "replay" }); },
    onInput: async (m) => { calls.push(m); },
    onResize: async (m) => { calls.push(m); },
  });
  const ws = new WebSocket(`${s.origin.replace("http", "ws")}/ws`, { headers: { "x-agentboard-token": token, origin: s.origin } });
  const got: unknown[] = [];
  ws.on("message", (d) => got.push(JSON.parse(d.toString())));
  await new Promise<void>((r) => ws.on("open", r));
  const until = async (ok: () => boolean) => { while (!ok()) await new Promise((r) => setTimeout(r, 5)); };

  ws.send(JSON.stringify({ t: "attach", consoleId: "a" }));
  ws.send("{not json");
  ws.send(JSON.stringify({ t: "bogus" }));
  ws.send(JSON.stringify({ t: "input", consoleId: "a", data: "ls\r" }));
  ws.send(JSON.stringify({ t: "resize", consoleId: "a", cols: 80, rows: 24 }));
  await until(() => calls.length === 3 && got.length === 1);
  expect(calls).toEqual([
    { t: "attach", consoleId: "a" },
    { t: "input", consoleId: "a", data: "ls\r" },
    { t: "resize", consoleId: "a", cols: 80, rows: 24 },
  ]);

  s.broadcast({ t: "output", consoleId: "b", data: "not attached" });
  s.broadcast({ t: "status", consoleId: "a", status: "idle" });
  expect(() => s.broadcast({ t: "status", consoleId: "a", status: "bogus" } as never)).toThrow();
  await until(() => got.length === 2);
  expect(got).toEqual([
    { t: "output", consoleId: "a", data: "replay" },
    { t: "status", consoleId: "a", status: "idle" },
  ]);
  ws.close();
});

test("an empty or weak token is refused at start", async () => {
  for (const bad of ["", "short", "x".repeat(31), `${"x".repeat(32)} `, `${"x".repeat(32)};`]) {
    await expect(createServer({ port: 0, token: bad, staticDir: tmpdir(), routes: {} })).rejects.toThrow(/token/);
  }
});

function raw(port: number, request: string) {
  return new Promise<string>((resolve) => {
    let out = "";
    const socket = net.connect(port, "127.0.0.1", () => socket.write(request));
    socket.on("data", (d) => { out += d.toString(); });
    socket.on("close", () => resolve(out));
    socket.on("error", () => resolve(out));
    setTimeout(() => socket.destroy(), 500);
  });
}

test("a request target the URL parser rejects is answered 400 and the server stays up", async () => {
  const s = await start();
  const host = `Host: 127.0.0.1:${s.port}\r\n`;
  expect(await raw(s.port, `GET // HTTP/1.1\r\n${host}Connection: close\r\n\r\n`)).toMatch(/^HTTP\/1\.1 401/);
  expect(await raw(s.port, `OPTIONS * HTTP/1.1\r\n${host}Connection: close\r\n\r\n`)).toMatch(/^HTTP\/1\.1 400/);
  const up = await raw(s.port, `GET // HTTP/1.1\r\n${host}Connection: Upgrade\r\nUpgrade: websocket\r\n`
    + `Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
  expect(up).not.toMatch(/101/);
  expect((await fetch(`${s.origin}/api/status`)).status).toBe(401);
});

test("a refused upgrade whose client resets early does not crash the server", async () => {
  const s = await start();
  const request = `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${s.port}\r\nOrigin: https://evil.example\r\n`
    + `Connection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\n`
    + `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`;
  await Promise.all(Array.from({ length: 50 }, () => new Promise<void>((resolve) => {
    const socket = net.connect(s.port, "127.0.0.1", () => socket.write(request, () => { socket.resetAndDestroy(); resolve(); }));
    socket.on("error", () => resolve());
  })));
  await new Promise((r) => setTimeout(r, 100));
  expect((await fetch(`${s.origin}/api/status`)).status).toBe(401);
});
