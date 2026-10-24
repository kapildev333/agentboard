import "./console.css";
import { useState } from "react";
import type { Board, ConsoleNode } from "@agentboard/shared";
import { useBoard } from "../board";
import { resumeConsole, startFresh } from "./actions";
import { CloseIcon, RestartIcon } from "./chrome";

const stopped = (b: Board) =>
  b.workspaces.flatMap((w) => w.nodes).filter((n): n is ConsoleNode => n.type === "console" && n.status === "stopped" && n.session !== undefined);

/**
 * The board has no "came back after a daemon restart" signal, so stopped consoles that hold a session when the
 * page first loads are that. Mount it once the board has loaded; dismissing it lasts for the page.
 */
export function RestartBanner({ fetch }: { fetch: typeof globalThis.fetch }) {
  const [count] = useState(() => stopped(useBoard.getState().board).length);
  const [shown, setShown] = useState(count > 0);
  const [error, setError] = useState<string>();
  if (!shown) return null;
  const all = async (act: (n: ConsoleNode) => Promise<string | undefined>) => {
    setError(undefined);
    const failed = (await Promise.all(stopped(useBoard.getState().board).map(act))).find(Boolean);
    if (failed) setError(failed);
    else setShown(false);
  };
  return (
    <div role="status" className="restart-banner">
      <RestartIcon />
      <p>
        <strong>Daemon restarted</strong>{" "}
        <span className="muted">
          · {count} {count === 1 ? "console is" : "consoles are"} back in place as stopped. Scrollback is gone; each CLI's own conversation resumes.
        </span>
      </p>
      {error && <span role="alert">{error}</span>}
      <button type="button" className="btn-sm" onClick={() => void all((n) => startFresh(fetch, n))}>
        Start all fresh
      </button>
      <button type="button" className="btn-sm btn-primary" onClick={() => void all((n) => resumeConsole(fetch, n.id))}>
        Resume all
      </button>
      <button type="button" className="btn-sm btn-quiet console-icon-btn" aria-label="Dismiss" onClick={() => setShown(false)}>
        <CloseIcon />
      </button>
    </div>
  );
}
