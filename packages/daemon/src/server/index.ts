import { timingSafeEqual } from "node:crypto";
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
    const route = compiled.find((r) => r.method === req.method && r.pattern.test(url.pathname));
    if (route) return void handle(route, opts.routes, req, url, res);
    if (req.method === "GET") return void serveStatic(opts.staticDir, url.pathname, res);
    end(res, 404);
  });
  // Host stops DNS rebinding, Origin stops cross-site requests, the token stops everything else.
  const refuse = (req: http.IncomingMessage, checkOrigin: boolean): number =>
    !ownHost(req, port) ? 403
      : checkOrigin && !ownOrigin(req, port) ? 403
      : !hasToken(req, opts.token) ? 401
      : 0;
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
    const status = new URL(req.url ?? "/", "http://x").pathname !== "/ws" ? 404 : refuse(req, true);
    if (status) {
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
