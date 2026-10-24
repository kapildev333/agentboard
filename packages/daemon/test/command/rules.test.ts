import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { BoardSnapshotSchema } from "@agentboard/shared";
import { parseRules } from "../../src/command/rules.js";

const snapshot = BoardSnapshotSchema.parse(
  JSON.parse(readFileSync(new URL("../../../shared/src/fixtures/snapshot.json", import.meta.url), "utf8")),
);

test("close the two idle consoles and resume the docs pass", () => {
  const steps = parseRules("close the two idle consoles and resume the docs pass", snapshot);
  expect(steps).toMatchObject([
    { kind: "close", consoleIds: ["c-ci", "c-lint"], asks: true },
    { kind: "resume", consoleId: "c-docs", asks: false },
  ]);
});
