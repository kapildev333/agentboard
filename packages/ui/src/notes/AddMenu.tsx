import { useEffect, useRef, useState } from "react";
import type { BoardNode } from "@agentboard/shared";
import { useBoard } from "../board";
import "./notes.css";

export type AddItem = { label: string; create: (position: { x: number; y: number }) => BoardNode };

/** The middle of what the board shows, in flow coordinates. */
const viewportCentre = () => {
  const { board } = useBoard.getState();
  const v = board.workspaces.find((w) => w.id === board.activeWorkspaceId)?.viewport ?? { x: 0, y: 0, zoom: 1 };
  const pane = document.querySelector<HTMLElement>(".board");
  const w = pane?.clientWidth || window.innerWidth;
  const h = pane?.clientHeight || window.innerHeight;
  return { x: (w / 2 - v.x) / v.zoom, y: (h / 2 - v.y) / v.zoom };
};

/** Each item's create receives the viewport centre. */
export function AddMenu({ items }: { items: AddItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const outside = (e: MouseEvent) => root.current?.contains(e.target as Node) || setOpen(false);
    window.addEventListener("keydown", key);
    document.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", outside);
    };
  }, [open]);
  return (
    <div className="add-menu" ref={root}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        Add
      </button>
      {open && (
        <ul role="menu" className="add-menu-list">
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  useBoard.getState().addNode(item.create(viewportCentre()));
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
