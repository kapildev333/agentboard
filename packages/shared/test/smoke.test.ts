import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { name } from "@agentboard/shared";

test("workspace resolves @agentboard/shared", () => {
  expect(name).toBe("agentboard");
  expect(createRequire(import.meta.url).resolve("@agentboard/shared/package.json")).toContain("packages/shared");
});
