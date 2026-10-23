import { expect, test } from "vitest";
import { name } from "@agentboard/shared";

test("workspace resolves @agentboard/shared", () => {
  expect(name).toBe("agentboard");
});
