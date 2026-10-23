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
  return (
    <div role="tablist" style={{ display: "flex", gap: 4 }}>
      {workspaces.map((w) => (
        <div key={w.id} style={{ fontWeight: w.id === activeWorkspaceId ? 700 : 400 }}>
          {editing === w.id ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(w.id)}
              onKeyDown={(e) => (e.key === "Enter" ? commit(w.id) : e.key === "Escape" && setEditing(null))}
            />
          ) : (
            <button
              role="tab"
              aria-selected={w.id === activeWorkspaceId}
              onClick={() => switchWorkspace(w.id)}
              onDoubleClick={() => {
                setDraft(w.name);
                setEditing(w.id);
              }}
            >
              {w.name}
            </button>
          )}
          {workspaces.length > 1 && (
            <button aria-label={`Delete ${w.name}`} onClick={() => deleteWorkspace(w.id)}>
              ×
            </button>
          )}
        </div>
      ))}
      <button aria-label="New workspace" onClick={() => createWorkspace(`Workspace ${workspaces.length + 1}`)}>
        +
      </button>
    </div>
  );
}
