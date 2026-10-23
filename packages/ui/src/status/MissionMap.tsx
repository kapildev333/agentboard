import type { ConsoleNode, ConsoleStatus } from "@agentboard/shared";
import { useBoard } from "../board";
import { LABEL, StatusBadge } from "./StatusBadge";

const ORDER: ConsoleStatus[] = ["needs_you", "working", "idle", "starting", "stopped", "exited"];

export function MissionMap({ onFocus }: { onFocus: (nodeId: string) => void }) {
  const nodes = useBoard((s) => s.board.workspaces.find((w) => w.id === s.board.activeWorkspaceId)?.nodes);
  const consoles = (nodes ?? []).filter((n): n is ConsoleNode => n.type === "console");
  return (
    <aside aria-label="Mission map">
      {ORDER.map((status) => {
        const rows = consoles.filter((n) => n.status === status);
        if (!rows.length) return null;
        return (
          <div key={status} role="group" aria-label={LABEL[status]}>
            <StatusBadge status={status} />
            {rows.map((n) => (
              <button key={n.id} type="button" onClick={() => onFocus(n.id)} style={{ display: "block", width: "100%", textAlign: "left" }}>
                {n.title} <small>{n.agent}</small>
              </button>
            ))}
          </div>
        );
      })}
    </aside>
  );
}
