import { expect, test } from "vitest";
import { agentboardHome, daemonFilePath } from "@agentboard/shared";

test("AGENTBOARD_HOME wins; an empty one falls back to ~/.agentboard", () => {
  expect(agentboardHome({ AGENTBOARD_HOME: "/x", HOME: "/h" })).toBe("/x");
  expect(agentboardHome({ AGENTBOARD_HOME: "", HOME: "/h" })).toBe("/h/.agentboard");
  expect(daemonFilePath({ HOME: "/h" })).toBe("/h/.agentboard/daemon.json");
});
