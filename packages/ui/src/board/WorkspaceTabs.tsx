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
    <div className="workspaces">
      <div role="tablist" className="tabs">
        {workspaces.map((w) =>
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
        <button className="btn-icon btn-quiet" aria-label={`Delete ${active.name}`} onClick={() => deleteWorkspace(active.id)}>
          ×
        </button>
      )}
      <button className="btn-icon btn-quiet" aria-label="New workspace" onClick={() => createWorkspace(`Workspace ${workspaces.length + 1}`)}>
        +
      </button>
    </div>
  );
}
