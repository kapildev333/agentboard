import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, expect, test } from "vitest";
import { PreviewInfoSchema } from "@agentboard/shared";
import { startDaemon } from "../src/app.js";
import { createServer } from "../src/server/index.js";
import { previewHandler, previewKey } from "../src/preview/index.js";

const token = "test-token-0123456789abcdef0123456789abcdef";
const key = previewKey(token);
const open: { close(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map((s) => s.close())); });

const CSS = Buffer.from("body{color:red}\n/* é */\r\n");
type Seen = { method?: string; headers: http.IncomingHttpHeaders };

// The local dev server the tile previews; it records what the proxy sent it.
async function startTarget() {
  const seen: Seen[] = [];
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method, headers: req.headers });
    if (req.url === "/page") return res.writeHead(200, { "content-type": "text/html", "set-cookie": "a=b" }).end("<!doctype html><html><head><title>t</title></head><body>hi</body></html>");
    if (req.url === "/bare") return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<p>no head</p>");
    if (req.url === "/style.css") return res.writeHead(200, { "content-type": "text/css" }).end(CSS);
    if (req.url === "/strict") return res.writeHead(200, { "content-type": "text/plain", "content-security-policy": "default-src 'none'" }).end("x");
    if (req.url === "/out") return res.writeHead(302, { location: "http://example.com/x" }).end();
    if (req.url === "/in") return res.writeHead(302, { location: "/style.css" }).end();
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  open.push({ close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }) });
  return { origin, seen };
}

async function startBoard() {
  const s = await createServer({ port: 0, token, staticDir: mkdtempSync(join(tmpdir(), "agentboard-static-")), routes: {}, preview: previewHandler(key) });
  open.push(s);
  return s;
}

const via = (board: { origin: string }, url: string, init: RequestInit = {}, k = key) =>
  fetch(`${board.origin}/preview/${k}/${encodeURIComponent(url)}`, { redirect: "manual", ...init, headers: { "x-agentboard-token": token, ...init.headers } });

test("an html target comes back with the capture script and a base tag", async () => {
  const t = await startTarget(), board = await startBoard();
  const res = await via(board, `${t.origin}/page`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/html");
  const html = await res.text();
  expect(html).toMatch(new RegExp(`^<!doctype html><html><head><base href="${t.origin}/"><script>[^<]*parent\\.postMessage[^<]*</script><title>t</title>`));
  expect(html).toContain(JSON.stringify(board.origin));
  expect(res.headers.get("content-security-policy")).toContain(`connect-src ${t.origin} ws://${t.origin.slice(7)}; frame-ancestors ${board.origin}`);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(res.headers.get("set-cookie")).toBeNull();
});

test.each([
  "http://example.com/",
  "https://127.0.0.1/",
  "http://10.0.0.1/",
  "http://127.0.0.1.example.com/",
  "file:///etc/hosts",
  "http://user:pw@127.0.0.1/",
  "not a url",
])("a non-loopback target is 403: %s", async (url) => {
  const board = await startBoard();
  expect((await via(board, url)).status).toBe(403);
});

test.each([["a wrong key", "0".repeat(32)], ["a short key", key.slice(0, 31)], ["the secret itself", token]])("%s is 404", async (_, k) => {
  const t = await startTarget(), board = await startBoard();
  expect((await via(board, `${t.origin}/page`, {}, k)).status).toBe(404);
  expect(t.seen).toEqual([]);
});

test.each(["POST", "PUT", "DELETE", "OPTIONS"])("a %s is 405", async (method) => {
  const t = await startTarget(), board = await startBoard();
  const res = await via(board, `${t.origin}/page`, { method, headers: { origin: board.origin } });
  expect(res.status).toBe(405);
  expect(res.headers.get("allow")).toBe("GET, HEAD");
  expect(t.seen).toEqual([]);
});

test("a HEAD reaches the target as a HEAD and comes back without a body", async () => {
  const t = await startTarget(), board = await startBoard();
  const res = await via(board, `${t.origin}/page`, { method: "HEAD", headers: { origin: board.origin } });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/html");
  expect(await res.text()).toBe("");
  expect(t.seen.map((s) => s.method)).toEqual(["HEAD"]);
});

test("the target never receives a cookie or authorization header", async () => {
  const t = await startTarget(), board = await startBoard();
  const res = await via(board, `${t.origin}/page`, {
    headers: { cookie: "agentboard_1=s", accept: "text/html", "accept-language": "en", "user-agent": "ua", "x-other": "1" },
  });
  expect(res.status).toBe(200);
  const sent = t.seen[0]!.headers;
  expect(sent).not.toHaveProperty("cookie");
  expect(sent).not.toHaveProperty("authorization");
  expect(sent).not.toHaveProperty("x-agentboard-token");
  expect(sent).not.toHaveProperty("x-other");
  expect(sent).toMatchObject({ accept: "text/html", "accept-language": "en", "user-agent": "ua" });
});

test("a css target passes through byte for byte", async () => {
  const t = await startTarget(), board = await startBoard();
  const res = await via(board, `${t.origin}/style.css`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/css");
  expect(Buffer.from(await res.arrayBuffer()).equals(CSS)).toBe(true);
  expect(res.headers.get("cache-control")).toBe("no-store");
});

test("a redirect to a non-loopback host is 403", async () => {
  const t = await startTarget(), board = await startBoard();
  const res = await via(board, `${t.origin}/out`);
  expect(res.status).toBe(403);
  expect(res.headers.get("location")).toBeNull();
});

test("a redirect to loopback is rewritten through the proxy", async () => {
  const t = await startTarget(), board = await startBoard();
  const res = await via(board, `${t.origin}/in`);
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe(`/preview/${key}/${encodeURIComponent(`${t.origin}/style.css`)}`);
});

test("the proxy's CSP comes ahead of the target's, which stays in force, and the page is sandboxed", async () => {
  const t = await startTarget(), board = await startBoard();
  const csp = (await via(board, `${t.origin}/strict`)).headers.get("content-security-policy");
  expect(csp).toBe(`connect-src ${t.origin} ws://${t.origin.slice(7)}; frame-ancestors ${board.origin}; sandbox allow-scripts allow-forms, default-src 'none'`);
});

test("the daemon answers GET /api/preview with the key and serves the proxy under it", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentboard-preview-"));
  open.push({ close: async () => rmSync(root, { recursive: true, force: true }) });
  const d = await startDaemon({ repoPath: root, home: join(root, "home"), agentPath: join(root, "bin") });
  open.push(d);
  const res = await fetch(`${d.origin}/api/preview`, { headers: { "x-agentboard-token": d.token } });
  const body = PreviewInfoSchema.parse(await res.json());
  expect(body.key).toBe(previewKey(d.token));
  expect(body.key).not.toContain(d.token);
  expect((await fetch(`${d.origin}/api/preview`)).status).toBe(401);
  const t = await startTarget();
  const page = await fetch(`${d.origin}/preview/${body.key}/${encodeURIComponent(`${t.origin}/style.css`)}`, { headers: { "x-agentboard-token": d.token } });
  expect(page.status).toBe(200);
  expect((await fetch(`${d.origin}/preview/${body.key}/${encodeURIComponent(`${t.origin}/style.css`)}`)).status).toBe(401);
});

test("an html page with no head gets the tags at the top", async () => {
  const t = await startTarget(), board = await startBoard();
  expect(await (await via(board, `${t.origin}/bare`)).text()).toMatch(new RegExp(`^<base href="${t.origin}/"><script>[^<]*</script><p>no head</p>$`));
});

test("the capture script posts console lines, errors and fetch summaries to the board's origin", async () => {
  const t = await startTarget(), board = await startBoard();
  const script = /<script>([^<]*)<\/script>/.exec(await (await via(board, `${t.origin}/page`)).text())![1]!;
  const posted: [unknown, string][] = [], listeners: Record<string, (e: unknown) => void> = {};
  const win: Record<string, unknown> = {
    parent: { postMessage: (m: unknown, o: string) => posted.push([m, o]) },
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    addEventListener: (type: string, f: (e: unknown) => void) => (listeners[type] = f),
    performance: { now: () => 0 },
    fetch: async () => ({ status: 201 }),
    XMLHttpRequest: function () {},
  };
  win.window = win;
  runInNewContext(script, win);
  runInNewContext(`console.error("boom", {a: 1}); fetch("/api/x", {method: "post"})`, win);
  listeners.error!({ message: "bad thing" });
  await new Promise((r) => setTimeout(r, 0));
  expect(posted).toEqual([
    [{ agentboard: "console", level: "error", text: 'boom {"a":1}' }, board.origin],
    [{ agentboard: "console", level: "error", text: "bad thing" }, board.origin],
    [{ agentboard: "network", method: "POST", url: "/api/x", status: 201, ms: 0 }, board.origin],
  ]);
});
