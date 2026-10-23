import { spawn } from "node:child_process";
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { CLAUDE_HOOK_EVENTS } from "../../daemon/src/agents/claude/index.js";

const script = fileURLToPath(new URL("hooks/post.mjs", import.meta.url));
const stdin = JSON.stringify({ hook_event_name: "Stop", session_id: "s1" });

const run = (env: Record<string, string>, input = stdin) =>
  new Promise<{ code: number | null; out: string; ms: number }>((resolve) => {
    const t = Date.now();
    const p = spawn(process.execPath, [script], { env: { PATH: process.env.PATH ?? "", ...env } });
    let out = "";
    p.stdout.on("data", (c) => (out += c));
    p.stderr.on("data", (c) => (out += c));
    p.on("exit", (code) => resolve({ code, out, ms: Date.now() - t }));
    p.stdin.end(input);
  });

const fake = async (hang = false) => {
  const reqs: { method?: string; url?: string; token?: unknown; body: unknown }[] = [];
  const server = http.createServer((req, res) => {
    let b = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      reqs.push({ method: req.method, url: req.url, token: req.headers["x-agentboard-token"], body: JSON.parse(b) });
      if (!hang) res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  return {
    reqs,
    port,
    close: () =>
      new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      }),
  };
};

test("exits 0 and posts nothing without the environment", async () => {
  const s = await fake();
  const r = await run({});
  await s.close();
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(r.ms).toBeLessThan(2000);
  expect(s.reqs).toEqual([]);
});

test("posts the wrapped event with the token when the environment is set", async () => {
  const s = await fake();
  const r = await run({ AGENTBOARD_URL: `http://127.0.0.1:${s.port}`, AGENTBOARD_CONSOLE_ID: "c9", AGENTBOARD_TOKEN: "tk" });
  await s.close();
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(s.reqs).toEqual([
    {
      method: "POST",
      url: "/hook/c9",
      token: "tk",
      body: { agent: "claude", event: "Stop", payload: { hook_event_name: "Stop", session_id: "s1" } },
    },
  ]);
});

test("wraps whatever event name Claude sends", async () => {
  const s = await fake();
  await run({ AGENTBOARD_URL: `http://127.0.0.1:${s.port}`, AGENTBOARD_CONSOLE_ID: "c9" }, JSON.stringify({ hook_event_name: "SessionEnd" }));
  await s.close();
  expect(s.reqs[0]?.body).toEqual({ agent: "claude", event: "SessionEnd", payload: { hook_event_name: "SessionEnd" } });
});

test("keeps multi-byte characters intact across stdin reads", async () => {
  const s = await fake();
  const text = "é€😀".repeat(40000);
  await run(
    { AGENTBOARD_URL: `http://127.0.0.1:${s.port}`, AGENTBOARD_CONSOLE_ID: "c9" },
    JSON.stringify({ hook_event_name: "Stop", text }),
  );
  await s.close();
  expect((s.reqs[0]?.body as { payload: { text: string } }).payload.text).toBe(text);
});

test("percent-encodes the console id in the path", async () => {
  const s = await fake();
  await run({ AGENTBOARD_URL: `http://127.0.0.1:${s.port}`, AGENTBOARD_CONSOLE_ID: "a/b" });
  await s.close();
  expect(s.reqs[0]?.url).toBe("/hook/a%2Fb");
});

test("posts nothing without the console id", async () => {
  const s = await fake();
  const r = await run({ AGENTBOARD_URL: `http://127.0.0.1:${s.port}` });
  await s.close();
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(s.reqs).toEqual([]);
});

test("exits 0 within the timeout when the server never answers", async () => {
  const s = await fake(true);
  const r = await run({ AGENTBOARD_URL: `http://127.0.0.1:${s.port}`, AGENTBOARD_CONSOLE_ID: "c9" });
  await s.close();
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(r.ms).toBeLessThan(4500);
});

test("exits 0 and posts nothing for non-JSON stdin", async () => {
  const s = await fake();
  const r = await run({ AGENTBOARD_URL: `http://127.0.0.1:${s.port}`, AGENTBOARD_CONSOLE_ID: "c9" }, "not json");
  await s.close();
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(s.reqs).toEqual([]);
});

test("exits 0 when the daemon is down", async () => {
  const s = await fake();
  await s.close();
  const r = await run({ AGENTBOARD_URL: `http://127.0.0.1:${s.port}`, AGENTBOARD_CONSOLE_ID: "c9" });
  expect(r).toMatchObject({ code: 0, out: "" });
  expect(r.ms).toBeLessThan(4000);
});

test("hooks.json names every event with the post script", () => {
  const { hooks } = JSON.parse(readFileSync(new URL("hooks/hooks.json", import.meta.url), "utf8"));
  // the same events the daemon's launcher injects into board consoles (L14)
  const events = [...CLAUDE_HOOK_EVENTS];
  expect(Object.keys(hooks).sort()).toEqual([...events].sort());
  for (const e of events)
    expect(hooks[e][0].hooks[0]).toMatchObject({
      type: "command",
      command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/post.mjs"',
      timeout: 5,
    });
});
