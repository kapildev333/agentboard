import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { BoardSnapshotSchema, PlanSchema, type Settings } from "@agentboard/shared";
import { planCommand } from "../../src/command/plan.js";

const snapshot = BoardSnapshotSchema.parse(
  JSON.parse(readFileSync(new URL("../../../shared/src/fixtures/snapshot.json", import.meta.url), "utf8")),
);
const settings: Settings = { fontSize: 13, customAgents: [] };

test("without a planner the rules plan, the plan is complete and the reply names what needs an OK", async () => {
  const fetch = vi.fn();
  const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(104);
  const text = "close the two idle consoles and resume the docs pass";
  const plan = await planCommand(text, snapshot, settings, { fetch, now });
  expect(PlanSchema.parse(plan)).toEqual(plan);
  expect(fetch).not.toHaveBeenCalled();
  expect(plan).toMatchObject({ text, plannedBy: "rules", ms: 4 });
  expect(plan.unknown).toBeUndefined();
  expect(plan.reply).toBe("Closing CI cleanup and Lint sweep needs your OK. Then I will resume Docs pass.");
});

test("safe steps alone are just announced", async () => {
  expect((await planCommand("fit all and focus checkout", snapshot, settings)).reply).toBe("I will fit all consoles and focus Checkout flow.");
});

test("text with no step gives unknown with a hint", async () => {
  const plan = await planCommand("focus the one that needs me", snapshot, settings);
  expect(plan.steps).toEqual([]);
  expect(plan.unknown).toBe("I can spawn, close, resume, focus, fit, add a note or type into a console");
  expect(plan.reply).toContain(plan.unknown);
});
