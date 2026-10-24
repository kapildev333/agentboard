import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { BoardSnapshotSchema, PlanSchema, RunRequestSchema, SettingsSchema, stepAsks, summarise } from "@agentboard/shared";
import type { PlanStep } from "@agentboard/shared";

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

test("summarise names consoles by title", () => {
  const snap = BoardSnapshotSchema.parse(fixture("snapshot.json"));
  const plan = PlanSchema.parse(fixture("plan.json"));
  expect(plan.steps.map((s) => summarise(s, snap))).toEqual(["Close CI cleanup and Lint sweep", "Resume Docs pass"]);
  const line = (s: Record<string, unknown>) => summarise({ id: "x", summary: "", asks: false, ...s } as PlanStep, snap);
  expect(line({ kind: "spawn", agent: "codex", worktree: "fix/flaky-cart-test" })).toBe("Spawn codex in worktree fix/flaky-cart-test");
  expect(line({ kind: "spawn", agent: "claude" })).toBe("Spawn claude");
  expect(line({ kind: "focus", consoleId: "c-checkout" })).toBe("Focus Checkout flow");
  expect(line({ kind: "fit" })).toBe("Fit all consoles");
  expect(line({ kind: "note", text: "hi" })).toBe("Add a note");
  expect(line({ kind: "input", consoleId: "c-checkout", text: "go" })).toBe("Type into Checkout flow");
  expect(line({ kind: "close", consoleIds: ["c-ci", "c-lint", "c-docs"] })).toBe("Close CI cleanup, Lint sweep and Docs pass");
  expect(line({ kind: "focus", consoleId: "c-gone" })).toBe("Focus c-gone");
});

test("SettingsSchema parses a settings file without planner and voice", () => {
  const s = SettingsSchema.parse({ fontSize: 13, customAgents: [] });
  expect(s.planner).toBeUndefined();
  expect(s.voice).toBeUndefined();
  const full = { fontSize: 13, customAgents: [], planner: { url: "http://127.0.0.1:11434", model: "m" }, voice: { transcribeCommand: "whisper-cli -nt -f", holdKey: "alt+space" } };
  expect(SettingsSchema.parse(full)).toEqual(full);
});
