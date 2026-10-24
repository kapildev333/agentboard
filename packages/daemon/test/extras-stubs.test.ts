import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { startDaemon } from "../src/app.js";

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});

test.each([
  ["GET", "/api/preview", "L32"],
])("%s %s answers 501 until lane %s", async (method, path, lane) => {
  const root = mkdtempSync(join(tmpdir(), "agentboard-stubs-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const d = await startDaemon({ repoPath: root, home: join(root, "home") });
  cleanup.push(() => d.close());
  const res = await fetch(`${d.origin}${path}`, { method, headers: { "x-agentboard-token": d.token } });
  expect(res.status).toBe(501);
  expect(await res.json()).toEqual({ error: `not implemented until lane ${lane}` });
});
