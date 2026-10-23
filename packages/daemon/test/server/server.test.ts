import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createServer, type ServerOptions } from "../../src/server/index.js";

const token = "test-token";
const open: { close(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map((s) => s.close())); });

async function start(extra: Partial<ServerOptions> = {}) {
  const staticDir = mkdtempSync(join(tmpdir(), "agentboard-static-"));
  writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>board</title>");
  const s = await createServer({ port: 0, token, staticDir, routes: {}, ...extra });
  open.push(s);
  return s;
}

test("a request without the token is refused with 401", async () => {
  const s = await start();
  const res = await fetch(`${s.origin}/api/status`);
  expect(res.status).toBe(401);
  expect(await res.text()).toBe("");
});

test("a foreign Origin on a POST is refused with 403", async () => {
  const s = await start();
  const res = await fetch(`${s.origin}/hook/c1`, {
    method: "POST",
    headers: { "x-agentboard-token": token, origin: "https://evil.example", "content-type": "application/json" },
    body: JSON.stringify({ agent: "claude", event: "Stop" }),
  });
  expect(res.status).toBe(403);
});
