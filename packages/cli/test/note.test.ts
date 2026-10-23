import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { noteCommand } from "../src/commands/note.js";
import { statusCommand } from "../src/commands/status.js";

const box = { x: 0, w: 300, h: 200 };
const board = {
  version: 1,
  repoPath: "/r",
  activeWorkspaceId: "w1",
  workspaces: [
    {
      id: "w1",
      name: "main",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { ...box, id: "c1", type: "console", title: "claude", y: 100, agent: "claude", cwd: "/r", status: "idle", createdAt: "t", lastActiveAt: "t" },
      ],
    },
  ],
};

let server: Server;
let put: unknown;
let getUrl: string | undefined;
beforeEach(async () => {
  const home = mkdtempSync(join(tmpdir(), "ab-cli-"));
  process.env.AGENTBOARD_HOME = home;
  put = undefined;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "PUT") {
        put = JSON.parse(body);
        return res.end(JSON.stringify({ ok: true }));
      }
      if (req.url?.startsWith("/api/board")) getUrl = req.url;
      res.end(JSON.stringify(req.url === "/api/status" ? { consoles: board.workspaces[0]!.nodes } : board));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port, token: "tok", pid: 4242 }));
});
afterEach(() => {
  delete process.env.AGENTBOARD_HOME;
  server.close();
});

test("note appends a node through GET and PUT", async () => {
  const lines: string[] = [];
  expect(await noteCommand(["remember", "this", "--repo", "/r"], { log: (s) => lines.push(s) })).toBe(0);
  expect(getUrl).toBe("/api/board?repo=%2Fr");
  const nodes = (put as typeof board).workspaces[0]!.nodes;
  expect(nodes).toHaveLength(2);
  const added = nodes[1] as unknown as { id: string; type: string; text: string; y: number };
  expect(added).toMatchObject({ type: "note", text: "remember this" });
  expect(added.y).toBeGreaterThanOrEqual(300);
  expect(JSON.parse(lines[0]!)).toEqual({ id: added.id });
});

test("status --json lists consoles", async () => {
  const lines: string[] = [];
  expect(await statusCommand(["--json"], (s) => lines.push(s))).toBe(0);
  expect(JSON.parse(lines[0]!)).toMatchObject({
    alive: true,
    pid: 4242,
    consoles: [{ id: "c1", title: "claude", agent: "claude", status: "idle" }],
  });
});
