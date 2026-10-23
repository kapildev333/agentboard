import { expect, test } from "vitest";
import * as shared from "@agentboard/shared";
import { routes } from "@agentboard/shared";

test("every route names schemas that exist", () => {
  const keys = routes.map((r) => `${r.method} ${r.path}`);
  expect(keys).toEqual(expect.arrayContaining([
    "GET /api/board", "PUT /api/board", "POST /api/consoles", "DELETE /api/consoles/:id",
    "POST /api/consoles/:id/resume", "GET /api/agents", "GET /api/status", "POST /hook/:consoleId",
    "GET /api/git/status", "GET /api/git/diff", "POST /api/git/worktree", "POST /api/git/commit",
    "POST /api/git/push", "POST /api/git/pr",
  ]));
  expect(new Set(keys).size).toBe(keys.length);
  for (const r of routes) {
    for (const n of [r.request, r.response]) if (n) expect(shared).toHaveProperty(n);
  }
});

test("POST /api/consoles request and response schemas validate", () => {
  const r = routes.find((x) => x.method === "POST" && x.path === "/api/consoles")!;
  expect(shared[r.request!].safeParse({ agent: "claude", cwd: "/tmp/r" }).success).toBe(true);
  expect(shared[r.request!].safeParse({ agent: "vim", cwd: "/tmp/r" }).success).toBe(false);
  expect(r.response).toBe("ConsoleNodeSchema");
});
