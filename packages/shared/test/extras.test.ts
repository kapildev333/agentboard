import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { BoardSchema } from "@agentboard/shared";

const fixture = () => JSON.parse(readFileSync(new URL("../src/fixtures/extras.json", import.meta.url), "utf8"));

test("a board with a text node, an image node, a stroke and a saved layout round-trips", () => {
  const raw = fixture();
  const board = BoardSchema.parse(raw);
  expect(board).toEqual(raw);
  const ws = board.workspaces[0]!;
  expect(ws.nodes.map((n) => n.type).sort()).toEqual(["image", "text", "webtile"]);
  expect(ws.ink).toHaveLength(1);
  expect(ws.layouts).toHaveLength(1);
});

test("a board without ink, layouts or capture still parses", () => {
  const raw = fixture();
  for (const ws of raw.workspaces) {
    delete ws.ink;
    delete ws.layouts;
    for (const n of ws.nodes) delete n.capture;
  }
  const board = BoardSchema.parse(raw);
  expect(board.workspaces[0]!.ink).toBeUndefined();
  expect(board.workspaces[0]!.layouts).toBeUndefined();
});
