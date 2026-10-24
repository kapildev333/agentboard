import type { ConsoleNode, ConsoleStatus } from "@agentboard/shared";
import { useBoard } from "../board";
import { LABEL, StatusBadge } from "./StatusBadge";

const ORDER: ConsoleStatus[] = ["needs_you", "working", "idle", "starting", "stopped", "exited"];

export function MissionMap({ onFocus }: { onFocus: (nodeId: string) => void }) {
  const nodes = useBoard((s) => s.board.workspaces.find((w) => w.id === s.board.activeWorkspaceId)?.nodes);
  const consoles = (nodes ?? []).filter((n): n is ConsoleNode => n.type === "console");
  return (
    <aside aria-label="Mission map" className="mission-map">
      <h2 className="section-title">Mission map</h2>
      {!consoles.length && <p className="muted mm-empty">No consoles on this workspace.</p>}
      {ORDER.map((status) => {
        const rows = consoles.filter((n) => n.status === status);
        if (!rows.length) return null;
        return (
          <div key={status} role="group" aria-label={LABEL[status]} className="mm-group">
            <h3 className="mm-heading">
              <StatusBadge status={status} />
              <span className="muted">{rows.length}</span>
            </h3>
            {rows.map((n) => (
              <button key={n.id} type="button" className="mm-row" onClick={() => onFocus(n.id)}>
                {/* data-dot, not data-status: the badge is the one element per status that carries data-status */}
                <span className="dot" data-dot={status} aria-hidden="true" />
                <span className="mm-title">{n.title}</span>
                <span className="mm-agent">{n.agent}</span>
              </button>
            ))}
          </div>
        );
      })}
    </aside>
  );
}
