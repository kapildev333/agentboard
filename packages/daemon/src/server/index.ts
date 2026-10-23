import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

export type ServerOptions = {
  port: number;
  token: string;
  staticDir: string;
  routes: Record<string, unknown>;
};

export async function createServer(opts: ServerOptions) {
  let port = 0;
  const server = http.createServer((req, res) => {
    if (req.method !== "GET" && !ownOrigin(req, port)) return end(res, 403);
    if (!hasToken(req, opts.token)) return end(res, 401);
    end(res, 404);
  });
  await new Promise<void>((resolve) => server.listen(opts.port, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
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
