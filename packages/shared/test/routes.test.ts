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

test("POST /api/open rejects an unknown editor", () => {
  expect(shared.OpenRequestSchema.safeParse({ editor: "vim", path: "/tmp" }).success).toBe(false);
});

const studioRoutes = [
  "GET /api/files",
  "GET /api/files/read",
  "PUT /api/files/write",
  "POST /api/consoles/:id/input",
  "GET /api/vault/notes",
  "GET /api/vault/note",
  "PUT /api/vault/note",
  "POST /api/vault/append",
];

test.each(studioRoutes)("every studio route has a request and a response schema and a fixture that parses: %s", (key) => {
  const r = routes.find((x) => `${x.method} ${x.path}` === key);
  expect(r?.request).toBeTruthy();
  const ex = examples[key]!;
  expect(shared[r!.request!].parse(ex.request)).toEqual(ex.request);
  expect(shared[r!.response].parse(ex.response)).toEqual(ex.response);
});

test("FileContentSchema takes null text for a binary or oversized file", () => {
  const big = { path: "a.bin", size: 2_000_000, lines: 0, text: null, language: "text" };
  expect(shared.FileContentSchema.parse(big)).toEqual(big);
});

test("BoardSchema keeps studio pins, defaulting to none", () => {
  const board = { version: 1, repoPath: "/tmp/r", activeWorkspaceId: "w", workspaces: [], studio: { document: "docs/a.md" } };
  expect(shared.BoardSchema.parse(board).studio).toEqual({ pins: [], document: "docs/a.md" });
});
