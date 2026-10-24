import type { Workspace } from "@agentboard/shared";

export type Preset = "grid" | "row" | "preview" | "focus";
export type Placed = { id: string; x: number; y: number; w: number; h: number };
type Box = Omit<Placed, "id">;

const GAP = 16;
const MIN_W = 240;
const MIN_H = 160;

const fit = (id: string, b: Box): Placed => ({ id, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(Math.max(MIN_W, b.w)), h: Math.round(Math.max(MIN_H, b.h)) });

/** Boxes for `ids` in a cols-wide grid inside `area`, 16 px apart. */
function cells(ids: string[], area: Box, cols: number): Placed[] {
  const rows = Math.ceil(ids.length / cols);
  const w = (area.w - GAP * (cols - 1)) / cols;
  const h = (area.h - GAP * (rows - 1)) / rows;
  return ids.map((id, i) => fit(id, { x: area.x + (i % cols) * (w + GAP), y: area.y + Math.floor(i / cols) * (h + GAP), w, h }));
}

/**
 * New positions and sizes for every node of `ws` under `preset`, filling the visible viewport in flow units
 * (the window's size divided by the zoom, from the workspace's pan). Pure: the caller writes the result.
 */
export function applyLayout(ws: Workspace, preset: Preset, opts: { selectedId?: string; viewport: { width: number; height: number } }): Placed[] {
  const { x: px, y: py, zoom } = ws.viewport;
  const ox = 0 - px / zoom;
  const oy = 0 - py / zoom;
  const W = opts.viewport.width / zoom;
  const H = opts.viewport.height / zoom;
  const ids = ws.nodes.map((n) => n.id);
  const inner: Box = { x: ox + GAP, y: oy + GAP, w: W - 2 * GAP, h: H - 2 * GAP };
  const column = (list: string[], x: number, w: number, top = inner) => cells(list, { x, y: top.y, w, h: top.h }, 1);

  if (preset === "row") return cells(ids, inner, Math.max(1, ids.length));
  const webs = ws.nodes.filter((n) => n.type === "webtile").map((n) => n.id);
  if (preset === "grid" || (preset === "preview" && !webs.length)) return cells(ids, inner, Math.max(1, Math.ceil(Math.sqrt(ids.length))));
  if (preset === "preview") {
    const rest = ids.filter((id) => !webs.includes(id));
    if (!rest.length) return column(webs, ox + GAP, W - 2 * GAP);
    return [...column(webs, ox + GAP, 0.6 * W - GAP), ...column(rest, ox + 0.6 * W + GAP, 0.4 * W - 2 * GAP)];
  }
  if (!ids.length) return [];
  const main = ids.includes(opts.selectedId ?? "") ? opts.selectedId! : ids[0]!;
  const parked = ids.filter((id) => id !== main);
  return [fit(main, { x: ox, y: oy, w: 0.8 * W, h: H }), ...column(parked, ox + 0.8 * W + GAP, 0.2 * W - 2 * GAP)];
}
