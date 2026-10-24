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
