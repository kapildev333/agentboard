import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { extname, resolve, sep } from "node:path";
import type { Duplex } from "node:stream";
import * as shared from "@agentboard/shared";
import { parseClientMessage, parseDaemonMessage, routes as table, type SchemaName } from "@agentboard/shared";
import type { ClientMessage, DaemonMessage } from "@agentboard/shared";
import WebSocket, { WebSocketServer } from "ws";

type Route = (typeof table)[number];
type Parsed<N> = N extends SchemaName ? ReturnType<(typeof shared)[N]["parse"]> : undefined;
export type RouteHandlers = {
  [R in Route as `${R["method"]} ${R["path"]}`]?: (
    input: Parsed<R["request"]>, params: Record<string, string>,
  ) => Promise<Parsed<R["response"]>>;
};
export type RouteKey = keyof RouteHandlers;
type Schema = { safeParse(v: unknown): { success: true; data: unknown } | { success: false } };
const schema = (name: SchemaName) => shared[name] as unknown as Schema;

const compiled = table.map((r) => ({
  ...r,
  key: `${r.method} ${r.path}` as RouteKey,
  pattern: new RegExp("^" + r.path.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"),
}));
const MAX_BODY = 1 << 20;
const CODE_TTL_MS = 60_000;

export type ServerOptions = {
  port: number;
  token: string;
  staticDir: string;
  routes: RouteHandlers;
  onAttach?: SocketHandler<"attach">;
  onInput?: SocketHandler<"input">;
  onResize?: SocketHandler<"resize">;
};
/** reply sends to the socket the message came from, e.g. the ring buffer on attach. */
export type SocketHandler<T extends ClientMessage["t"]> =
  (message: Extract<ClientMessage, { t: T }>, reply: (message: DaemonMessage) => void) => Promise<void>;

export async function createServer(opts: ServerOptions) {
  // same("", "") is true, so an empty token would let every request in.
  if (!/^[\w-]{32,}$/.test(opts.token)) throw new Error("token must be at least 32 characters of [A-Za-z0-9_-]");
  let port = 0;
  // One-time codes for the browser URL, so the token itself never lands in history.
  const codes = new Map<string, number>();
  const issueCode = () => {
    const code = randomBytes(24).toString("base64url");
    codes.set(code, Date.now() + CODE_TTL_MS);
    return code;
  };
  const sessions = new Set<string>();
  const takeCode = (code: string) => {
    const expires = codes.get(code);
    codes.delete(code);
    for (const [c, t] of codes) if (t < Date.now()) codes.delete(c);
    return expires !== undefined && expires >= Date.now();
  };
  const server = http.createServer((req, res) => {
    // No page may frame the board, whatever the response.
    res.setHeader("content-security-policy", "frame-ancestors 'none'");
    const url = target(req);
    if (!url) return end(res, 400);
    if (req.method === "GET" && isIndex(url.pathname) && url.searchParams.has("code")) {
      if (!sameSite(req)) return end(res, 403);
      if (!takeCode(url.searchParams.get("code")!)) return end(res, 401);
      url.searchParams.delete("code");
      const session = randomBytes(32).toString("base64url");
      sessions.add(session);
      res.writeHead(302, {
        // SameSite ignores ports, so the name carries the port and the value is a session, not the token.
        "set-cookie": `agentboard_${port}=${session}; HttpOnly; SameSite=Strict; Path=/`,
        location: url.pathname + url.search,
      }).end();
      return;
    }
    const refused = refuse(req, req.method !== "GET");
    if (refused) return end(res, refused);
    if (req.method === "POST" && url.pathname === "/auth/code") {
      // Header token only: the CLI and MCP mint codes, a page holding the cookie does not.
      const header = req.headers["x-agentboard-token"];
      if (typeof header !== "string") return end(res, 401);
      return json(res, 200, { code: issueCode() });
    }
    const route = compiled.find((r) => r.method === req.method && r.pattern.test(url.pathname));
    if (route) return void handle(route, opts.routes, req, url, res);
    if (req.method === "GET") return void serveStatic(opts.staticDir, url.pathname, res);
    end(res, 404);
  });
  // Host stops DNS rebinding; Origin and Sec-Fetch-Site stop other pages, including other ports on
  // 127.0.0.1, which SameSite treats as the same site; the token or session stops everything else.
  const sameSite = (req: http.IncomingMessage): boolean => {
    const site = req.headers["sec-fetch-site"];
    return ownHost(req, port) && ownOrigin(req, port) && (site === undefined || site === "same-origin" || site === "none");
  };
  // strict: non-GET or upgrade, where browsers always send Origin. A cookie request must prove it came
  // from the board itself: by Origin, or on a GET by Sec-Fetch-Site; only header callers may send neither.
  const refuse = (req: http.IncomingMessage, strict: boolean): number => {
    if (!sameSite(req)) return 403;
    const auth = authOf(req);
    if (!auth) return 401;
    const proven = req.headers.origin !== undefined || (!strict && req.headers["sec-fetch-site"] !== undefined);
    return auth === "cookie" && !proven ? 403 : 0;
  };
  const authOf = (req: http.IncomingMessage): "header" | "cookie" | null => {
    const header = req.headers["x-agentboard-token"];
    if (typeof header === "string") return same(header, opts.token) ? "header" : null;
    const name = `agentboard_${port}=`;
    const cookie = req.headers.cookie?.split(";").map((c) => c.trim()).find((c) => c.startsWith(name));
    return cookie !== undefined && sessions.has(cookie.slice(name.length)) ? "cookie" : null;
  };
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY });
  const attached = new Map<WebSocket, Set<string>>();
  const send = (ws: WebSocket, text: string) => { if (ws.readyState === WebSocket.OPEN) ws.send(text); };
  const onMessage = (ws: WebSocket, data: Buffer) => {
    let m: ClientMessage;
    try { m = parseClientMessage(JSON.parse(data.toString("utf8"))); } catch { return; }
    if (m.t === "attach") attached.get(ws)?.add(m.consoleId);
    const reply = (out: DaemonMessage) => send(ws, JSON.stringify(parseDaemonMessage(out)));
    Promise.resolve()
      .then(() => m.t === "attach" ? opts.onAttach?.(m, reply) : m.t === "input" ? opts.onInput?.(m, reply) : opts.onResize?.(m, reply))
      .catch(() => {});
  };
  server.on("upgrade", (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    // http drops its own listeners on upgrade; an unhandled reset here would take the daemon down.
    socket.on("error", () => socket.destroy());
    const url = target(req);
    if (!url) return void socket.destroy();
    const status = url.pathname !== "/ws" ? 404 : refuse(req, true);
    if (status) {
      // A half-open client would otherwise keep the socket, and close(), waiting forever.
      socket.once("finish", () => socket.destroy());
      socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      attached.set(ws, new Set());
      ws.on("message", (data) => onMessage(ws, data));
      ws.on("close", () => attached.delete(ws));
      ws.on("error", () => ws.terminate());
    });
  });
  await new Promise<void>((resolve) => server.listen(opts.port, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    /** A one-time code for `${origin}/?code=…`, valid for a minute. */
    issueCode,
    /** Validates, then sends a console's messages to sockets attached to it and board messages to all. */
    broadcast(message: DaemonMessage): void {
      const text = JSON.stringify(parseDaemonMessage(message));
      for (const [ws, ids] of attached) if (!("consoleId" in message) || ids.has(message.consoleId)) send(ws, text);
    },
    close: () => new Promise<void>((resolve) => {
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

// Origin-form only; prefixing keeps "//host/x" a path instead of a URL with a host, and "//" from throwing.
function target(req: http.IncomingMessage): URL | null {
  if (!req.url?.startsWith("/")) return null;
  try { return new URL("http://x" + req.url); } catch { return null; }
}

function ownHost(req: http.IncomingMessage, port: number): boolean {
  return req.headers.host === `127.0.0.1:${port}` || req.headers.host === `localhost:${port}`;
}

// An absent Origin passes here; refuse decides whether the caller may omit it.
function ownOrigin(req: http.IncomingMessage, port: number): boolean {
  const origin = req.headers.origin;
  return origin === undefined || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
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

async function handle(
  route: (typeof compiled)[number], handlers: RouteHandlers, req: http.IncomingMessage, url: URL, res: http.ServerResponse,
): Promise<void> {
  const handler = handlers[route.key] as ((input: unknown, params: Record<string, string>) => Promise<unknown>) | undefined;
  if (!handler) return json(res, 404, { error: "not found" });
  let raw: unknown, params: Record<string, string>;
  try {
    params = Object.fromEntries(
      Object.entries(route.pattern.exec(url.pathname)!.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]),
    );
    raw = route.method === "GET" ? Object.fromEntries(url.searchParams) : await readJson(req);
  } catch (err) {
    return json(res, err === tooLarge ? 413 : 400, { error: "invalid request" });
  }
  let input: unknown;
  if (route.request) {
    const parsed = schema(route.request).safeParse(raw);
    if (!parsed.success) return json(res, 400, { error: "invalid request" });
    input = parsed.data;
  }
  let result: unknown;
  try {
    result = await handler(input, params);
  } catch {
    return json(res, 500, { error: "internal error" });
  }
  const out = schema(route.response).safeParse(result);
  if (!out.success) return json(res, 500, { error: "invalid response" });
  json(res, 200, out.data);
}

const tooLarge = new Error("body too large");

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw tooLarge;
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text === "" ? undefined : JSON.parse(text);
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(body));
}

function end(res: http.ServerResponse, status: number): void {
  res.writeHead(status).end();
}
