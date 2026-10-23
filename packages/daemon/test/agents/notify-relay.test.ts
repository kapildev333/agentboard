import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { relay } from "../../src/agents/notify-relay.js";

const env = { AGENTBOARD_URL: "http://127.0.0.1:4000", AGENTBOARD_CONSOLE_ID: "c1", AGENTBOARD_TOKEN: "t0k", AGENTBOARD_AGENT: "codex" };

test("relay posts { agent, event, payload } to the console hook URL and never throws", async () => {
  const fetchFn = vi.fn().mockResolvedValue({ ok: true });
  await relay('{"type":"agent-turn-complete","turn-id":"1"}', env, fetchFn as unknown as typeof fetch);
  const [url, init] = fetchFn.mock.calls[0]!;
  expect(url).toBe("http://127.0.0.1:4000/hook/c1");
  expect(JSON.parse(init.body)).toEqual({
    agent: "codex",
    event: "agent-turn-complete",
    payload: { type: "agent-turn-complete", "turn-id": "1" },
  });
  expect(init.headers.authorization).toBe("Bearer t0k");
  await relay('{"hook_event_name":"AfterAgent"}', { ...env, AGENTBOARD_AGENT: "gemini" }, fetchFn as unknown as typeof fetch);
  expect(JSON.parse(fetchFn.mock.calls[1]![1].body).event).toBe("AfterAgent");
  await expect(relay("{}", env, vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch)).resolves.toBeUndefined();
  await expect(relay("not json", env, fetchFn as unknown as typeof fetch)).resolves.toBeUndefined();
});

test("relay program reads argv or stdin, posts, and exits 0", async () => {
  const bodies: string[] = [];
  const server = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      bodies.push(b);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const script = fileURLToPath(new URL("../../src/agents/notify-relay.ts", import.meta.url));
  const run = (args: string[], stdin?: string) =>
    new Promise<number | null>((resolve) => {
      const p = spawn(process.execPath, ["--experimental-strip-types", script, ...args], {
        env: { ...process.env, AGENTBOARD_URL: url, AGENTBOARD_CONSOLE_ID: "c1", AGENTBOARD_AGENT: "codex" },
        stdio: ["pipe", "ignore", "ignore"],
      });
      p.on("close", resolve);
      p.stdin.end(stdin ?? "");
    });
  expect(await run(['{"type":"a"}'])).toBe(0);
  expect(await run([], '{"type":"b"}')).toBe(0);
  server.close();
  expect(bodies.map((b) => JSON.parse(b).event)).toEqual(["a", "b"]);
  // daemon down: still exit 0
  expect(await run(['{"type":"c"}'])).toBe(0);
});
