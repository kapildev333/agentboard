import { afterEach, expect, test, vi } from "vitest";
import { api } from "../src/api.js";

afterEach(() => vi.unstubAllGlobals());

test("every call names the CLI to the daemon's call log", async () => {
  const f = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", f);
  await api({ port: 1, token: "tok", pid: 1 }, "GET", "/api/status");
  expect(f.mock.calls[0]).toMatchObject([expect.any(String), { headers: { "x-agentboard-token": "tok", "x-agentboard-client": "cli" } }]);
});
