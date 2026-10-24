import type { ConsoleNode } from "@agentboard/shared";

const short = (id: string) => (id.length > 9 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id);

export interface ConsoleOverlayProps {
  node: Pick<ConsoleNode, "status" | "session">;
  onResume: () => void;
  onStartFresh: () => void;
  onRemove: () => void;
}

/** What a console that is not running offers over its dimmed terminal. */
export function ConsoleOverlay({ node, onResume, onStartFresh, onRemove }: ConsoleOverlayProps) {
  if (node.status === "stopped")
    return (
      <div className="console-overlay nodrag">
        <div className="console-stopped">
          <p>
            <span className="console-overlay-label">Stopped</span> <span className="console-session">daemon restarted</span>
          </p>
          {node.session && <p className="console-session">session {short(node.session.id)}</p>}
          <div className="console-overlay-actions">
            {/* Named "Resume", not "Resume session": the restart e2e counts one button per node whose name holds "Resume". */}
            <button type="button" className="btn-primary" onClick={onResume}>
              Resume
            </button>
            <button type="button" onClick={onStartFresh}>
              Start fresh
            </button>
          </div>
        </div>
      </div>
    );
  if (node.status === "exited")
    return (
      <div className="console-exited-actions nodrag">
        <button type="button" className="btn-sm" onClick={onStartFresh}>
          Relaunch
        </button>
        <button type="button" className="btn-sm console-danger" onClick={onRemove}>
          Remove node
        </button>
      </div>
    );
  return null;
}
