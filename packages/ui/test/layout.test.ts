import { expect, it } from "vitest";
import type { BoardNode, Workspace } from "@agentboard/shared";
import { applyLayout } from "../src/layout";

const con = (id: string): BoardNode => ({ id, type: "console", title: id, x: 0, y: 0, w: 400, h: 300 }) as BoardNode;
const web = (id: string): BoardNode => ({ id, type: "webtile", title: id, x: 0, y: 0, w: 400, h: 300, url: "http://localhost:3000" }) as BoardNode;
const ws = (nodes: BoardNode[], viewport = { x: 0, y: 0, zoom: 1 }): Workspace => ({ id: "a", name: "A", viewport, nodes });
const vp = { width: 1000, height: 800 };

it("four consoles under grid get a 2 by 2 arrangement with gaps", () => {
  const out = applyLayout(ws(["a", "b", "c", "d"].map(con)), "grid", { viewport: vp });
  expect(out).toEqual([
    { id: "a", x: 16, y: 16, w: 476, h: 376 },
    { id: "b", x: 508, y: 16, w: 476, h: 376 },
    { id: "c", x: 16, y: 408, w: 476, h: 376 },
    { id: "d", x: 508, y: 408, w: 476, h: 376 },
  ]);
});

it("the visible area follows the workspace viewport and zoom", () => {
  const out = applyLayout(ws([con("a")], { x: -200, y: -100, zoom: 2 }), "grid", { viewport: vp });
  expect(out[0]).toEqual({ id: "a", x: 116, y: 66, w: 468, h: 368 });
});

it("row gives equal columns in one row", () => {
  const out = applyLayout(ws(["a", "b"].map(con)), "row", { viewport: vp });
  expect(out.map((n) => [n.x, n.y, n.w, n.h])).toEqual([[16, 16, 476, 768], [508, 16, 476, 768]]);
});

it("focus puts the selected node first at 80 percent", () => {
  const out = applyLayout(ws(["a", "b", "c"].map(con)), "focus", { selectedId: "b", viewport: vp });
  expect(out[0]).toEqual({ id: "b", x: 0, y: 0, w: 800, h: 800 });
  expect(out.slice(1).map((n) => n.id)).toEqual(["a", "c"]);
  expect(out[1]!.x).toBeGreaterThanOrEqual(816);
  expect(out[2]!.y).toBeGreaterThan(out[1]!.y);
});

it("focus falls back to the first node", () => {
  expect(applyLayout(ws(["a", "b"].map(con)), "focus", { viewport: vp })[0]!.id).toBe("a");
});

it("preview puts the web tile left", () => {
  const out = applyLayout(ws([con("a"), web("w"), con("b")]), "preview", { viewport: vp });
  const w = out.find((n) => n.id === "w")!;
  expect(w).toMatchObject({ x: 16, w: 584, h: 768 });
  for (const id of ["a", "b"]) expect(out.find((n) => n.id === id)!.x).toBeGreaterThan(w.x + w.w);
});

it("preview without a web tile is a grid", () => {
  const nodes = ["a", "b", "c"].map(con);
  expect(applyLayout(ws(nodes), "preview", { viewport: vp })).toEqual(applyLayout(ws(nodes), "grid", { viewport: vp }));
});

it("nodes keep a minimum of 240 by 160", () => {
  const out = applyLayout(ws(Array.from({ length: 9 }, (_, i) => con(`n${i}`))), "row", { viewport: vp });
  for (const n of out) expect(n.w).toBeGreaterThanOrEqual(240);
  const tall = applyLayout(ws(Array.from({ length: 8 }, (_, i) => con(`n${i}`))), "focus", { viewport: { width: 1000, height: 300 } });
  for (const n of tall) expect(n.h).toBeGreaterThanOrEqual(160);
});
