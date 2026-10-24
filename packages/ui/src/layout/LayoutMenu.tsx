import { useEffect, useState } from "react";
import type { Workspace } from "@agentboard/shared";
import { useBoard } from "../board";
import { applyLayout, type Placed, type Preset } from "./applyLayout";
import "./layout.css";

const PRESETS: { preset: Preset; label: string; key: string }[] = [
  { preset: "grid", label: "2×2 Grid of consoles", key: "1" },
  { preset: "row", label: "One row", key: "2" },
  { preset: "preview", label: "Preview + consoles", key: "3" },
  { preset: "focus", label: "Focus one, park the rest", key: "4" },
];

/** Writes positions into the active workspace through the store; `autosaveBoard` carries them to the daemon. */
function place(placed: Placed[]) {
  const by = new Map(placed.map((p) => [p.id, p]));
  editActive((w) => ({ ...w, nodes: w.nodes.map((n) => ({ ...n, ...by.get(n.id), id: n.id })) }));
}

const editActive = (f: (w: Workspace) => Workspace) =>
  useBoard.setState(({ board }) => ({ board: { ...board, workspaces: board.workspaces.map((w) => (w.id === board.activeWorkspaceId ? f(w) : w)) } }));

const active = () => {
  const { board } = useBoard.getState();
  return board.workspaces.find((w) => w.id === board.activeWorkspaceId);
};

function run(preset: Preset) {
  const ws = active();
  if (!ws) return;
  const pane = document.querySelector<HTMLElement>(".board");
  const viewport = { width: pane?.clientWidth || window.innerWidth, height: pane?.clientHeight || window.innerHeight };
  const selectedId = document.querySelector(".react-flow__node.selected")?.getAttribute("data-id") ?? undefined;
  place(applyLayout(ws, preset, { selectedId, viewport }));
}

/** Terminals and fields own the keyboard while focused. */
const typing = () => {
  const el = document.activeElement;
  return !!el && (!!el.closest(".xterm") || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el as HTMLElement).isContentEditable);
};

export function LayoutMenu() {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const layouts = useBoard((s) => s.board.workspaces.find((w) => w.id === s.board.activeWorkspaceId)?.layouts) ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey || typing()) return;
      const hit = PRESETS.find((p) => e.code === `Digit${p.key}`);
      if (!hit) return;
      e.preventDefault();
      run(hit.preset);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setOpen(false);
    setNaming(false);
    setName("");
  };
  const save = () => {
    const n = name.trim();
    if (!n) return;
    editActive((w) => ({
      ...w,
      layouts: [...(w.layouts ?? []).filter((l) => l.name !== n), { name: n, nodes: Object.fromEntries(w.nodes.map((x) => [x.id, { x: x.x, y: x.y, w: x.w, h: x.h }])) }],
    }));
    close();
  };

  return (
    <div className="layout-menu">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        Layout
      </button>
      {open && (
        <div role="menu" className="layout-pop" onKeyDown={(e) => e.key === "Escape" && close()}>
          {PRESETS.map((p) => (
            <button key={p.preset} type="button" role="menuitem" onClick={() => (run(p.preset), close())}>
              {p.label} <kbd>⌘⇧{p.key}</kbd>
            </button>
          ))}
          {naming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <input aria-label="Layout name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              <button type="submit">Save</button>
            </form>
          ) : (
            <button type="button" role="menuitem" onClick={() => setNaming(true)}>
              Save current layout…
            </button>
          )}
          {layouts.map((l) => (
            <div key={l.name} className="layout-saved">
              <span>{l.name}</span>
              <button
                type="button"
                aria-label={`Apply ${l.name}`}
                onClick={() => {
                  place(Object.entries(l.nodes).map(([id, b]) => ({ id, ...b })));
                  close();
                }}
              >
                Apply
              </button>
              <button type="button" aria-label={`Delete ${l.name}`} onClick={() => editActive((w) => ({ ...w, layouts: (w.layouts ?? []).filter((x) => x.name !== l.name) }))}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
