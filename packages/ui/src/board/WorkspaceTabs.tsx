import { useState } from "react";
import { useBoard } from "./store";

export function WorkspaceTabs() {
  const { workspaces, activeWorkspaceId } = useBoard((s) => s.board);
  const { switchWorkspace, createWorkspace, renameWorkspace, deleteWorkspace } = useBoard.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const commit = (id: string) => {
    if (draft.trim()) renameWorkspace(id, draft.trim());
    setEditing(null);
  };
  const active = workspaces.find((w) => w.id === activeWorkspaceId);
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <div role="tablist" style={{ display: "flex", gap: 4 }}>
        {workspaces.map((w) =>
          editing === w.id ? (
            <input
              key={w.id}
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
              style={{ fontWeight: w.id === activeWorkspaceId ? 700 : 400 }}
              onClick={() => switchWorkspace(w.id)}
              onDoubleClick={() => {
                setDraft(w.name);
                setEditing(w.id);
              }}
            >
              {w.name}
            </button>
          ),
        )}
      </div>
      {active && workspaces.length > 1 && (
        <button aria-label={`Delete ${active.name}`} onClick={() => deleteWorkspace(active.id)}>
          ×
        </button>
      )}
      <button aria-label="New workspace" onClick={() => createWorkspace(`Workspace ${workspaces.length + 1}`)}>
        +
      </button>
    </div>
  );
}
