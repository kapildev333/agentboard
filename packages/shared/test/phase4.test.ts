import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import * as shared from "@agentboard/shared";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../src/fixtures/${name}.json`, import.meta.url), "utf8"));

const fixtures = {
  team: "TeamSchema",
  summary: "ConsoleSummarySchema",
  event: "EventSchema",
  handoff: "HandoffSchema",
  loop: "LoopSchema",
  "composer-launch": "ComposerLaunchRequestSchema",
  "composer-template": "ComposerTemplateSchema",
  "usage-report": "UsageReportSchema",
  "memory-item": "MemoryItemSchema",
  profile: "ProfileSchema",
} as const;

test("every phase 4 fixture parses with its schema", () => {
  for (const [name, schema] of Object.entries(fixtures)) {
    const raw = fixture(name);
    expect(shared[schema].parse(raw), name).toEqual(raw);
  }
});

test("LoopSchema rejects a trigger of an unknown kind", () => {
  const loop = fixture("loop") as Record<string, unknown>;
  expect(shared.LoopSchema.safeParse({ ...loop, trigger: { kind: "webhook", url: "/x" } }).success).toBe(false);
});

test("an old settings file without profiles, composerTemplates and memory parses with the defaults", () => {
  expect(shared.SettingsSchema.parse({ fontSize: 13, customAgents: [] })).toEqual({
    fontSize: 13,
    customAgents: [],
    profiles: [],
    composerTemplates: [],
    memory: { offerAtSpawn: false },
  });
});

test("a workspace without teams parses, and one with teams keeps them", () => {
  const ws = { id: "ws-main", name: "Main", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] };
  expect(shared.WorkspaceSchema.parse(ws)).toEqual(ws);
  const withTeams = { ...ws, teams: [fixture("team")] };
  expect(shared.WorkspaceSchema.parse(withTeams)).toEqual(withTeams);
});
