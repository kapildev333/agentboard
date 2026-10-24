import { useEffect, useState } from "react";
import { mod, typing } from "./keys";
import { useBoard } from "./store";

export function WorkspaceTabs() {
  const { workspaces, activeWorkspaceId } = useBoard((s) => s.board);
  const { switchWorkspace, createWorkspace, renameWorkspace, deleteWorkspace } = useBoard.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // ⌘1..⌘9 pick a workspace; a focused terminal or field keeps the key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!mod(e) || e.shiftKey || e.altKey || !/^[1-9]$/.test(e.key) || typing(e.target)) return;
      const ws = useBoard.getState().board.workspaces[Number(e.key) - 1];
      if (!ws) return;
      e.preventDefault();
      switchWorkspace(ws.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switchWorkspace]);
  const commit = (id: string) => {
    if (draft.trim()) renameWorkspace(id, draft.trim());
    setEditing(null);
  };
  const active = workspaces.find((w) => w.id === activeWorkspaceId);
  return (
    <nav aria-label="Workspaces" className="workspaces">
      <div role="tablist" className="tabs">
        {workspaces.map((w, i) =>
          editing === w.id ? (
            <input
              key={w.id}
              className="tab-input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(w.id)}
              onKeyDown={(e) => (e.key === "Enter" ? commit(w.id) : e.key === "Escape" && setEditing(null))}
            />
          ) : (
            <button
              key={w.id}
              role="tab"
              aria-selected={w.id === activeWorkspaceId}
              className="tab"
              aria-keyshortcuts={i < 9 ? `Meta+${i + 1}` : undefined}
              onClick={() => switchWorkspace(w.id)}
              onDoubleClick={() => {
                setDraft(w.name);
                setEditing(w.id);
              }}
            >
              {w.name}
              {i < 9 && <kbd className="kbd" aria-hidden="true">⌘{i + 1}</kbd>}
            </button>
          ),
        )}
      </div>
      {active && workspaces.length > 1 && (
        <button className="btn-icon btn-quiet" aria-label={`Delete ${active.name}`} onClick={() => deleteWorkspace(active.id)}>
          ×
        </button>
      )}
      <button className="btn-icon btn-quiet" aria-label="New workspace" onClick={() => createWorkspace(`Workspace ${workspaces.length + 1}`)}>
        +
      </button>
    </nav>
  );
}
