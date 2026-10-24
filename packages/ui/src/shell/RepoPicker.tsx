import { useEffect, useState } from "react";
import { AgentInfoListSchema, type AgentInfo } from "@agentboard/shared";
import { FolderIcon } from "../board";
import { AgentMark } from "../status";

/** A repo opened before; consoles is how many it had when last seen. Older pages stored bare paths. */
export type RecentRepo = { path: string; consoles?: number };
type Fetch = (url: string) => Promise<Response>;

const COMMANDS = ["agentboard open .", "agentboard spawn claude --worktree feat-x", "agentboard status"];

const repoName = (path: string) => path.replace(/\/+$/, "").split("/").pop() || path;
const consoleCount = (n: number) => (n === 0 ? "empty" : n === 1 ? "1 console" : `${n} consoles`);

/** The launch page's body (the Launch artboard): open a repo, the CLI way in, and the agents the daemon found. */
export function RepoPicker({
  recent,
  onOpen,
  onAddAgent,
  fetch = globalThis.fetch,
}: {
  recent: (string | RecentRepo)[];
  onOpen: (path: string) => void;
  onAddAgent?: () => void;
  fetch?: Fetch;
}) {
  const [path, setPath] = useState("");
  const [copied, setCopied] = useState("");
  const [agents, setAgents] = useState<AgentInfo[]>();
  const [scan, setScan] = useState(0);
  useEffect(() => {
    let on = true;
    fetch("/api/agents")
      .then((r) => r.json())
      .then((j) => on && setAgents(AgentInfoListSchema.parse(j)))
      .catch(() => on && setAgents([]));
    return () => void (on = false);
  }, [fetch, scan]);
  const copy = (cmd: string) =>
    navigator.clipboard?.writeText(cmd).then(
      () => setCopied("Copied"),
      () => setCopied("Could not copy"),
    );

  return (
    <div className="launch-main">
      <section className="card launch-open" aria-labelledby="launch-open-title">
        <div className="launch-head">
          <h1 id="launch-open-title" className="title">Open a repo as a board</h1>
          <p className="muted">
            Each repo keeps its own board, workspaces and consoles in <span className="mono">~/.agentboard/boards/</span>.
          </p>
        </div>
        {recent.length > 0 && (
          <div className="launch-group">
            <h2 className="label">Recent</h2>
            <ul className="recent">
              {recent.map((entry) => {
                const r = typeof entry === "string" ? { path: entry } : entry;
                return (
                  <li key={r.path}>
                    <button type="button" className="recent-item" title={r.path} onClick={() => onOpen(r.path)}>
                      <FolderIcon />
                      <span className="recent-text">
                        <span className="recent-name">{repoName(r.path)}</span>
                        <span className="recent-path mono muted">{r.path}</span>
                      </span>
                      {r.consoles !== undefined && <span className="chip">{consoleCount(r.consoles)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="launch-group">
          <h2 className="label">Or a path</h2>
          <form
            className="launch-path"
            onSubmit={(e) => {
              e.preventDefault();
              if (path.trim()) onOpen(path.trim());
            }}
          >
            <input aria-label="repo path" className="mono" placeholder="~/code/…" value={path} onChange={(e) => setPath(e.target.value)} />
            <button type="submit" className="btn-primary">Open</button>
          </form>
          <p className="caption">
            Not a git repo? It still opens; worktrees stay disabled until <span className="mono">git init</span>.
          </p>
        </div>
      </section>

      <div className="launch-aside">
        <section className="card launch-card" aria-label="From any terminal">
          <h2 className="label">From any terminal</h2>
          {COMMANDS.map((cmd) => (
            <div key={cmd} className="cmd">
              <code>
                <span className="prompt" aria-hidden="true">$ </span>
                {cmd}
              </code>
              <button type="button" className="btn-sm btn-quiet" aria-label={`Copy ${cmd}`} onClick={() => void copy(cmd)}>
                Copy
              </button>
            </div>
          ))}
          <p className="caption">
            Each command starts the daemon if none answers. <span role="status">{copied}</span>
          </p>
        </section>

        <section className="card launch-card" aria-label="Agents on PATH">
          <div className="launch-card-head">
            <h2 className="label">Agents on PATH</h2>
            <button type="button" className="btn-sm btn-quiet" onClick={() => setScan(scan + 1)}>Rescan</button>
          </div>
          <ul className="launch-agents">
            {agents?.map((a) => {
              const name = a.id === "custom" ? (a.name ?? a.command) : a.id;
              return (
                <li key={`${a.id}:${a.customId ?? ""}`}>
                  <AgentMark agent={a.id === "custom" ? name : a.id} />
                  <span className="launch-agent-name">{name}</span>
                  <span className="mono muted">{a.available ? (a.version ?? "on PATH") : "not installed"}</span>
                  <span className="agent-dot" data-available={String(a.available)} aria-hidden="true" />
                </li>
              );
            })}
          </ul>
          {agents?.length === 0 && <p className="caption">No agents found. Is the daemon running?</p>}
          {onAddAgent && (
            <button type="button" className="launch-add" onClick={onAddAgent}>
              <span className="mark mark-custom" aria-hidden="true">+</span>
              Add a custom command…
            </button>
          )}
        </section>

        <p className="caption launch-privacy">
          No account. No telemetry. The daemon listens only on <span className="mono">127.0.0.1</span> and every request carries a per-launch token.
        </p>
      </div>
    </div>
  );
}
