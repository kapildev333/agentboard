import { useEffect, useState } from "react";
import { AgentInfoListSchema, type AgentInfo } from "@agentboard/shared";
import { CopyIcon, FolderIcon } from "../board";
import { AgentMark } from "../status";

/** A repo opened before; consoles is how many it had when last seen. Older pages stored bare paths. */
export type RecentRepo = { path: string; consoles?: number };
type Fetch = (url: string) => Promise<Response>;

const COMMANDS = [
  ["agentboard open", "Open the board for the repo you are in"],
  ["agentboard spawn claude", "Add a console to that board"],
  ["agentboard status", "List every console and its status"],
] as const;

const repoName = (path: string) => path.replace(/\/+$/, "").split("/").pop() || path;

export function RepoPicker({ recent, onOpen, fetch = globalThis.fetch }: { recent: (string | RecentRepo)[]; onOpen: (path: string) => void; fetch?: Fetch }) {
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
        <h1 id="launch-open-title" className="title">Open a repo as a board</h1>
        <p className="muted">Each repo gets one board: its consoles, notes and workspaces, kept by the daemon on this machine.</p>
        {recent.length > 0 && (
          <>
            <h2 className="label">Recent</h2>
            <ul className="recent">
              {recent.map((entry) => {
                const r = typeof entry === "string" ? { path: entry } : entry;
                return (
                  <li key={r.path}>
                    <button type="button" className="recent-item" title={r.path} onClick={() => onOpen(r.path)}>
                      <FolderIcon />
                      <span className="recent-name">{repoName(r.path)}</span>
                      <span className="recent-path mono muted">{r.path}</span>
                      {r.consoles !== undefined && <span className="chip">{r.consoles === 1 ? "1 console" : `${r.consoles} consoles`}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <h2 className="label">Or a path</h2>
        <form
          className="launch-path"
          onSubmit={(e) => {
            e.preventDefault();
            if (path.trim()) onOpen(path.trim());
          }}
        >
          <input aria-label="repo path" className="path-field" placeholder="/path/to/repo" value={path} onChange={(e) => setPath(e.target.value)} />
          <button type="submit" className="btn-primary">Open</button>
        </form>
        <p className="caption">Not a git repo? Any folder opens as a board; the git card and worktrees need git.</p>
      </section>

      <div className="launch-aside">
        <section className="card launch-card" aria-label="From any terminal">
          <h2 className="section-heading">From any terminal</h2>
          <ul className="launch-commands">
            {COMMANDS.map(([cmd, what]) => (
              <li key={cmd}>
                <code className="mono">{cmd}</code>
                <span className="caption">{what}</span>
                <button type="button" className="btn-sm" aria-label={`Copy ${cmd}`} onClick={() => void copy(cmd)}>
                  <CopyIcon />
                  Copy
                </button>
              </li>
            ))}
          </ul>
          <p role="status" className="caption">{copied}</p>
        </section>

        <section className="card launch-card" aria-label="Agents on PATH">
          <div className="launch-card-head">
            <h2 className="section-heading">Agents on PATH</h2>
            <button type="button" className="btn-sm btn-quiet" onClick={() => setScan(scan + 1)}>Rescan</button>
          </div>
          <ul className="launch-agents">
            {agents?.map((a) => {
              const name = a.id === "custom" ? (a.name ?? a.command) : a.id;
              return (
                <li key={`${a.id}:${a.customId ?? ""}`}>
                  <AgentMark agent={a.id === "custom" ? name : a.id} />
                  <span className="launch-agent-name">{name}</span>
                  <span className={a.available ? "mono" : "mono muted"}>{a.available ? (a.version ?? "on PATH") : "not installed"}</span>
                  <span className="agent-dot" data-available={String(a.available)} aria-hidden="true" />
                </li>
              );
            })}
          </ul>
          {agents?.length === 0 && <p className="caption">No agents found. Is the daemon running?</p>}
        </section>

        <p className="caption launch-privacy">AgentBoard runs on this machine: no account, no telemetry. The board, the terminals and the daemon never leave it.</p>
      </div>
    </div>
  );
}
