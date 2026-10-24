import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import * as shared from "@agentboard/shared";
import { routes } from "@agentboard/shared";

const examples: Record<string, { request: unknown; response: unknown }> = JSON.parse(
  readFileSync(new URL("../src/fixtures/routes.json", import.meta.url), "utf8"),
);

test("every route has an example keyed by 'METHOD path', and nothing else does", () => {
  expect(Object.keys(examples).sort()).toEqual(routes.map((r) => `${r.method} ${r.path}`).sort());
});

test.each(routes.map((r) => [`${r.method} ${r.path}`, r] as const))("%s examples round-trip", (key, r) => {
  const ex = examples[key]!;
  if (r.request) expect(shared[r.request].parse(ex.request)).toEqual(ex.request);
  else expect(ex.request).toBeNull();
  expect(shared[r.response].parse(ex.response)).toEqual(ex.response);
});

test("POST /api/consoles rejects an unknown agent", () => {
  expect(shared.SpawnConsoleRequestSchema.safeParse({ agent: "vim", cwd: "/tmp/r" }).success).toBe(false);
});

test("POST /api/consoles accepts an optional customId", () => {
  expect(shared.SpawnConsoleRequestSchema.parse({ agent: "custom", cwd: "/tmp/r", customId: "mine" }).customId).toBe("mine");
});

test("GET /api/agents keeps customId and name on custom entries", () => {
  const entry = { id: "custom", command: "mytool", version: null, available: true, customId: "mine", name: "Mine" };
  expect(shared.AgentInfoListSchema.parse([entry])).toEqual([entry]);
});

test("a custom agent has an id, name, command and args; needsYou is optional", () => {
  const agent = { id: "fake", name: "Fake", command: "fake", args: [] };
  expect(shared.CustomAgentSchema.parse(agent)).toEqual(agent);
  expect(shared.CustomAgentSchema.safeParse({ name: "Fake", command: "fake" }).success).toBe(false);
});

test("routes.json lists every phase 4 route with existing schema names", () => {
  const phase4 = [
    "GET /api/events",
    "POST /api/handoffs", "PUT /api/handoffs/:id", "POST /api/handoffs/:id/send", "GET /api/handoffs",
    "GET /api/loops", "POST /api/loops", "PUT /api/loops/:id", "DELETE /api/loops/:id",
    "POST /api/loops/:id/pause", "POST /api/loops/:id/resume", "POST /api/loops/:id/run",
    "POST /api/composer/launch", "GET /api/composer/templates",
    "GET /api/usage", "GET /api/usage.csv",
    "GET /api/memory", "POST /api/memory", "PUT /api/memory/:id", "DELETE /api/memory/:id",
    "POST /api/memory/:id/push", "POST /api/memory/propose",
  ];
  for (const key of phase4) {
    const r = routes.find((r) => `${r.method} ${r.path}` === key);
    expect(r, key).toBeDefined();
    expect(examples[key], key).toBeDefined();
    for (const name of [r!.request, r!.response]) if (name) expect(shared[name], `${key} ${name}`).toBeDefined();
  }
  expect(routes.find((r) => r.path === "/api/usage.csv")!.response).toBe("TextSchema");
});

test("POST /api/open rejects an unknown editor", () => {
  expect(shared.OpenRequestSchema.safeParse({ editor: "vim", path: "/tmp" }).success).toBe(false);
});
