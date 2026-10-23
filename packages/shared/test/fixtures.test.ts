import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { BoardSchema } from "@agentboard/shared";

test("fixtures/board.json parses with BoardSchema", () => {
  const raw = JSON.parse(readFileSync(new URL("../src/fixtures/board.json", import.meta.url), "utf8"));
  const board = BoardSchema.parse(raw);
  expect(board.workspaces).toHaveLength(2);
  const nodes = board.workspaces.flatMap((w) => w.nodes);
  const consoles = nodes.filter((n) => n.type === "console");
  expect(new Set(consoles.map((c) => c.status)).size).toBe(3);
  expect(nodes.map((n) => n.type).sort()).toEqual(["checklist", "console", "console", "console", "note", "webtile"]);
});
