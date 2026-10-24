import { useEffect, useRef, useState } from "react";
import { ViewportPortal, useReactFlow } from "@xyflow/react";
import { create } from "zustand";
import type { Stroke } from "@agentboard/shared";
import { useBoard } from "../board";

type Mode = "off" | "pen" | "eraser";
type Point = [number, number];

const COLORS = [
  ["Accent", "var(--color-accent)"],
  ["Red", "var(--color-danger)"],
  ["Green", "var(--term-ansi-green)"],
  ["Yellow", "var(--term-ansi-yellow)"],
] as const;
const WIDTHS = [2, 4, 8] as const;
const MIN_STEP = 2;

const useInk = create<{ mode: Mode; color: string; width: number }>()(() => ({ mode: "off", color: COLORS[0][1], width: 4 }));
const setInk = useInk.setState;

// Strokes live on the active workspace, edited through the board store so autosave and the rev flow carry them.
const editInk = (f: (ink: Stroke[]) => Stroke[]) =>
  useBoard.setState(({ board }) => ({
    board: { ...board, workspaces: board.workspaces.map((w) => (w.id === board.activeWorkspaceId ? { ...w, ink: f(w.ink ?? []) } : w)) },
  }));

const path = (pts: Point[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");

/** Distance from p to the segment a-b. */
function distToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const hit = (s: Stroke, p: Point, r: number) => s.points.some((q, i) => distToSegment(p, s.points[i - 1] ?? q, q) <= r);

/** True while a terminal or an input owns the keyboard. */
const typing = () => !!document.activeElement?.closest(".xterm, input, textarea, select, [contenteditable]");

const Stroked = ({ s }: { s: Pick<Stroke, "points" | "color" | "width"> }) => (
  <path d={path(s.points)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />
);

/** Strokes of the active workspace in flow coordinates; the overlay is only there while Pen or Eraser is on. Mount inside the React Flow provider. */
export function InkLayer() {
  const strokes = useBoard((s) => s.board.workspaces.find((w) => w.id === s.board.activeWorkspaceId)?.ink);
  const { mode, color, width } = useInk();
  const { screenToFlowPosition } = useReactFlow();
  const [draft, setDraft] = useState<Point[]>();
  const drawing = useRef(false);

  useEffect(() => {
    if (mode === "off") return;
    const leave = (e: KeyboardEvent) => e.key === "Escape" && !typing() && setInk({ mode: "off" });
    window.addEventListener("keydown", leave);
    return () => window.removeEventListener("keydown", leave);
  }, [mode]);

  const at = (e: React.PointerEvent): Point => {
    const { x, y } = screenToFlowPosition({ x: e.clientX, y: e.clientY });    return [x, y];
  };
  const erase = (p: Point) => {
    const r = Math.max(width, 8);
    // Only touch the board when something is hit, so a plain drag never marks it unsaved.
    if (strokes?.some((s) => hit(s, p, r))) editInk((ink) => ink.filter((s) => !hit(s, p, r)));
  };

  return (
    <>
      <ViewportPortal>
        <svg style={{ position: "absolute", overflow: "visible", width: 1, height: 1, pointerEvents: "none" }} aria-hidden="true">
          {strokes?.map((s) => <Stroked key={s.id} s={s} />)}
          {draft && <Stroked s={{ points: draft, color, width }} />}
        </svg>
      </ViewportPortal>
      {mode !== "off" && (
        <div
          data-testid="ink-overlay"
          style={{ position: "absolute", inset: 0, zIndex: 5, cursor: "crosshair", pointerEvents: "auto", touchAction: "none" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            drawing.current = true;
            if (mode === "pen") setDraft([at(e)]);
            else erase(at(e));
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const p = at(e);
            if (mode === "eraser") return erase(p);
            setDraft((d) => {
              const last = d?.at(-1);
              return d && last && Math.hypot(p[0] - last[0], p[1] - last[1]) >= MIN_STEP ? [...d, p] : d;
            });
          }}
          onPointerUp={(e) => {
            if (!drawing.current) return;
            drawing.current = false;
            e.currentTarget.releasePointerCapture?.(e.pointerId);
            const points = draft;
            setDraft(undefined);
            if (points && points.length >= 2) editInk((ink) => [...ink, { id: crypto.randomUUID(), points, color, width }]);
          }}
        />
      )}
    </>
  );
}

/** Pen, Eraser, Done, colours and widths. State is shared with InkLayer, so it can sit anywhere, such as the top bar. */
export function InkToolbar() {
  const { mode, color, width } = useInk();
  return (
    <span className="ink-toolbar" role="group" aria-label="Ink">
      <button type="button" aria-pressed={mode === "pen"} onClick={() => setInk({ mode: "pen" })}>Pen</button>
      <button type="button" aria-pressed={mode === "eraser"} onClick={() => setInk({ mode: "eraser" })}>Eraser</button>
      <button type="button" disabled={mode === "off"} onClick={() => setInk({ mode: "off" })}>Done</button>
      {COLORS.map(([name, c]) => (
        <button key={name} type="button" aria-label={name} aria-pressed={color === c} onClick={() => setInk({ color: c })} style={{ background: c, width: 20, height: 20, borderRadius: "50%" }} />
      ))}
      {WIDTHS.map((w) => (
        <button key={w} type="button" aria-label={`Width ${w}`} aria-pressed={width === w} onClick={() => setInk({ width: w })}>
          {w}
        </button>
      ))}
    </span>
  );
}
