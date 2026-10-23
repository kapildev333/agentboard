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
  const server = http.createServer((req, res) => {
    if (!hasToken(req, opts.token)) return end(res, 401);
    end(res, 404);
  });
  await new Promise<void>((resolve) => server.listen(opts.port, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
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
