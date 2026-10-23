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
