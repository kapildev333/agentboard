import { expect, test } from "vitest";
import { BoardSchema } from "@agentboard/shared";

const box = { x: 0, y: 0, w: 200, h: 120 };
const board = (ws: object) => ({
  version: 1,
  repoPath: "/tmp/r",
  activeWorkspaceId: "w",
  workspaces: [{ id: "w", name: "Main", viewport: { x: 0, y: 0, zoom: 1 }, ...ws }],
});

test("a board with a text node, an image node, a stroke and a saved layout round-trips", () => {
  const raw = board({
    nodes: [
      { id: "t", title: "Text", ...box, type: "text", markdown: "# hi" },
      { id: "i", title: "Img", ...box, type: "image", assetId: "a1", width: 64, height: 32, alt: "" },
      { id: "w1", title: "Web", ...box, type: "webtile", url: "http://localhost:3000", capture: true },
    ],
    ink: [{ id: "s", points: [[0, 0], [5, 5]], color: "#fff", width: 2 }],
    layouts: [{ name: "tidy", nodes: { t: box } }],
  });
  expect(BoardSchema.parse(raw)).toEqual(raw);
});

test("a board without ink, layouts or capture still parses", () => {
  const raw = board({ nodes: [{ id: "w1", title: "Web", ...box, type: "webtile", url: "http://x" }] });
  const parsed = BoardSchema.parse(raw);
  expect(parsed.workspaces[0]).not.toHaveProperty("ink");
  expect(parsed.workspaces[0]).not.toHaveProperty("layouts");
});
