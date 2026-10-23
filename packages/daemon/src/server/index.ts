import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { extname, resolve, sep } from "node:path";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";

export type ServerOptions = {
  port: number;
  token: string;
  staticDir: string;
  routes: Record<string, unknown>;
};

export async function createServer(opts: ServerOptions) {
  let port = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method === "GET" && isIndex(url.pathname) && url.searchParams.has("token")) {
      if (!ownHost(req, port)) return end(res, 403);
      if (!same(url.searchParams.get("token")!, opts.token)) return end(res, 401);
      url.searchParams.delete("token");
      res.writeHead(302, {
        "set-cookie": `agentboard=${opts.token}; HttpOnly; SameSite=Strict; Path=/`,
        location: url.pathname + url.search,
      }).end();
      return;
    }
    const refused = refuse(req, req.method !== "GET");
    if (refused) return end(res, refused);
    if (req.method === "GET") return void serveStatic(opts.staticDir, url.pathname, res);
    end(res, 404);
  });
  // Host stops DNS rebinding, Origin stops cross-site requests, the token stops everything else.
  const refuse = (req: http.IncomingMessage, checkOrigin: boolean): number =>
    !ownHost(req, port) ? 403
      : checkOrigin && !ownOrigin(req, port) ? 403
      : !hasToken(req, opts.token) ? 401
      : 0;
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    const status = new URL(req.url ?? "/", "http://x").pathname !== "/ws" ? 404 : refuse(req, true);
    if (status) {
      socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      return;
    }
    wss.handleUpgrade(req, socket, head, () => {});
  });
  await new Promise<void>((resolve) => server.listen(opts.port, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => {
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

function ownHost(req: http.IncomingMessage, port: number): boolean {
  return req.headers.host === `127.0.0.1:${port}` || req.headers.host === `localhost:${port}`;
}

// An absent Origin is a non-browser client (a CLI hook); browsers always send one on these requests.
function ownOrigin(req: http.IncomingMessage, port: number): boolean {
  const origin = req.headers.origin;
  return origin === undefined || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

function hasToken(req: http.IncomingMessage, token: string): boolean {
  const header = req.headers["x-agentboard-token"];
  if (typeof header === "string") return same(header, token);
  const cookie = req.headers.cookie?.split(";").map((c) => c.trim()).find((c) => c.startsWith("agentboard="));
  return cookie !== undefined && same(cookie.slice("agentboard=".length), token);
}

const isIndex = (pathname: string) => pathname === "/" || pathname === "/index.html";

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".wasm": "application/wasm",
};

async function serveStatic(dir: string, pathname: string, res: http.ServerResponse): Promise<void> {
  const root = resolve(dir);
  let file: string;
  try { file = resolve(root, "." + decodeURIComponent(isIndex(pathname) ? "/index.html" : pathname)); }
  catch { return end(res, 400); }
  if (!file.startsWith(root + sep)) return end(res, 404);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    end(res, 404);
  }
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function end(res: http.ServerResponse, status: number): void {
  res.writeHead(status).end();
}
