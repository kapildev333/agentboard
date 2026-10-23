import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
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
    const refused = refuse(req, req.method !== "GET");
    if (refused) return end(res, refused);
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
  return typeof header === "string" && same(header, token);
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function end(res: http.ServerResponse, status: number): void {
  res.writeHead(status).end();
}
