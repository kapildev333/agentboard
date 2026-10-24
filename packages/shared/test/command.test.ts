import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { PlanSchema } from "@agentboard/shared";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../src/fixtures/${name}`, import.meta.url), "utf8"));

test("PlanSchema parses the plan fixture", () => {
  const plan = PlanSchema.parse(fixture("plan.json"));
  expect(plan.steps[0]!.asks).toBe(true);
});
