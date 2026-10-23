import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { spawnCommand } from "../src/commands/spawn.js";

let server: Server;
let seen: { method?: string; url?: string; token?: unknown; body: string }[];
let reply: (url: string, method: string) => [number, unknown];

beforeEach(async () => {
  const home = mkdtempSync(join(tmpdir(), "ab-cli-"));
  process.env.AGENTBOARD_HOME = home;
  seen = [];
  reply = () => [200, {}];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, token: req.headers["x-agentboard-token"], body });
      const [code, json] = reply(req.url ?? "", req.method ?? "");
      res.statusCode = code;
      res.end(JSON.stringify(json));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port, token: "tok", pid: 4242 }));
});
afterEach(() => {
  delete process.env.AGENTBOARD_HOME;
  delete process.env.AGENTBOARD_CONSOLE_ID;
  server.close();
});

const node = { id: "c1", type: "console", title: "opencode" };

test("spawn posts the agent and caller id and prints the node", async () => {
  process.env.AGENTBOARD_CONSOLE_ID = "caller-9";
  reply = (url, method) => (method === "POST" && url === "/api/consoles" ? [200, node] : [200, {}]);
  const lines: string[] = [];
  expect(await spawnCommand(["opencode", "--worktree", "feat-x"], { log: (s) => lines.push(s) })).toBe(0);
  const post = seen.find((r) => r.method === "POST")!;
  expect(post.token).toBe("tok");
  expect(JSON.parse(post.body)).toMatchObject({ agent: "opencode", worktree: "feat-x", callerConsoleId: "caller-9" });
  expect(JSON.parse(lines[0]!).id).toBe("c1");
});

test("spawn exits 1 with an error object when the daemon answers 400", async () => {
  reply = (_, method) => (method === "POST" ? [400, { error: "bad agent" }] : [200, {}]);
  const lines: string[] = [];
  expect(await spawnCommand(["opencode"], { log: (s) => lines.push(s) })).toBe(1);
  expect(JSON.parse(lines[0]!)).toEqual({ error: "bad agent" });
});
