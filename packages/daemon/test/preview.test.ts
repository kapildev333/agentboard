import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
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
