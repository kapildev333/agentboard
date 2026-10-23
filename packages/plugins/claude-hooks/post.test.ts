import { spawnSync, spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { CLAUDE_HOOK_EVENTS } from "../../daemon/src/agents/claude/index.js";

const script = fileURLToPath(new URL("hooks/post.mjs", import.meta.url));
const run = (env: Record<string, string>) =>
  new Promise<number | null>((resolve) => {
    const p = spawn(process.execPath, [script], { env: { PATH: process.env.PATH ?? "", ...env } });
    p.on("exit", resolve);
    p.stdin.end(JSON.stringify({ hook_event_name: "Stop", session_id: "s1" }));
  });

test("post.mjs posts the stdin JSON to AGENTBOARD_URL for AGENTBOARD_CONSOLE_ID", async () => {
  const got: { url?: string; token?: string; body?: unknown } = {};
  const server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      Object.assign(got, { url: req.url, token: req.headers["x-agentboard-token"], body: JSON.parse(b) });
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  const code = await run({
    AGENTBOARD_URL: `http://127.0.0.1:${port}`,
    AGENTBOARD_CONSOLE_ID: "c9",
    AGENTBOARD_TOKEN: "tk",
  });
  server.close();
  expect(code).toBe(0);
  expect(got).toEqual({ url: "/hook/c9", token: "tk", body: { hook_event_name: "Stop", session_id: "s1" } });
});

test("post.mjs exits 0 silently without the variables", () => {
  const r = spawnSync(process.execPath, [script], { input: "{}", env: { PATH: process.env.PATH ?? "" } });
  expect(r.status).toBe(0);
  expect(r.stdout.length + r.stderr.length).toBe(0);
});

test("hooks.json registers exactly the CLAUDE_HOOK_EVENTS, each running post.mjs", () => {
  const { hooks } = JSON.parse(readFileSync(new URL("hooks/hooks.json", import.meta.url), "utf8"));
  expect(Object.keys(hooks).sort()).toEqual([...CLAUDE_HOOK_EVENTS].sort());
  for (const e of CLAUDE_HOOK_EVENTS) expect(hooks[e][0].hooks[0].command).toContain("hooks/post.mjs");
});
