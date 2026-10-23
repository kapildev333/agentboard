import { expect, test, vi } from "vitest";
import { relay } from "../../src/agents/notify-relay.js";

test("relay posts the payload to the console hook URL and never throws", async () => {
  const fetchFn = vi.fn().mockResolvedValue({ ok: true });
  const env = { AGENTBOARD_URL: "http://127.0.0.1:4000", AGENTBOARD_CONSOLE_ID: "c1", AGENTBOARD_TOKEN: "t0k" };
  await relay('{"type":"agent-turn-complete"}', env, fetchFn as unknown as typeof fetch);
  const [url, init] = fetchFn.mock.calls[0]!;
  expect(url).toBe("http://127.0.0.1:4000/hook/c1");
  expect(init.body).toBe('{"type":"agent-turn-complete"}');
  expect(init.headers.authorization).toBe("Bearer t0k");
  await expect(relay("{}", env, vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch)).resolves.toBeUndefined();
});
