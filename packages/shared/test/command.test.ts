import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { PlanSchema, RunRequestSchema, SettingsSchema, stepAsks } from "@agentboard/shared";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../src/fixtures/${name}`, import.meta.url), "utf8"));

test("PlanSchema parses the plan fixture", () => {
  const plan = PlanSchema.parse(fixture("plan.json"));
  expect(plan.steps[0]!.asks).toBe(true);
});

test("stepAsks is true for close and input only", () => {
  const kinds = ["spawn", "close", "resume", "focus", "fit", "note", "input"] as const;
  expect(kinds.filter(stepAsks)).toEqual(["close", "input"]);
});

test("RunRequestSchema rejects a step of unknown kind", () => {
  const plan = fixture("plan.json");
  plan.steps.push({ id: "s3", kind: "teleport", summary: "x", asks: false });
  expect(RunRequestSchema.safeParse({ plan, confirmed: [], skipped: [] }).success).toBe(false);
});

test("SettingsSchema parses a settings file without planner and voice", () => {
  const s = SettingsSchema.parse({ fontSize: 13, customAgents: [] });
  expect(s.planner).toBeUndefined();
  expect(s.voice).toBeUndefined();
  const full = { fontSize: 13, customAgents: [], planner: { url: "http://127.0.0.1:11434", model: "m" }, voice: { transcribeCommand: "whisper-cli -nt -f", holdKey: "alt+space" } };
  expect(SettingsSchema.parse(full)).toEqual(full);
});
