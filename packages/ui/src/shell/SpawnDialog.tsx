import { useEffect, useId, useState } from "react";
import {
  AgentInfoListSchema,
  ConsoleNodeSchema,
  SpawnConsoleRequestSchema,
  type AgentInfo,
  type ConsoleNode,
} from "@agentboard/shared";
import "./spawn.css";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

// How each agent reports its status, and the letter on its mark (a custom agent's is its name's first letter).
const SIGNAL: Record<string, string> = { claude: "hooks per session", codex: "notify", gemini: "hooks", opencode: "plugin", custom: "custom · regex needs-you" };
const MARK: Record<string, string> = { claude: "C", codex: "X", gemini: "G", opencode: "O" };
// The UI is not told the home directory, so a macOS or Linux home prefix stands in for it.
const tilde = (p: string) => p.replace(/^\/(Users|home)\/[^/]+(?=\/|$)/, "~");

export function SpawnDialog({
  fetch,
  cwd,
  branch: base,
  onSpawned,
  onCancel,
}: {
  fetch: Fetch;
  cwd: string;
  branch?: string;
  onSpawned: (n: ConsoleNode) => void;
  onCancel?: () => void;
}) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  // A custom entry is told apart by its customId; built-in ids are unique on their own.
  const [choice, setChoice] = useState<AgentInfo>();
  const keyOf = (a?: AgentInfo) => a && `${a.id}:${a.customId ?? ""}`;
  const [useWorktree, setUseWorktree] = useState(false);
  const [branch, setBranch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const name = branch.trim();
  const canSpawn = !!choice && !busy && !(useWorktree && !name);
  const id = useId();

  useEffect(() => {
    fetch("/api/agents")
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? `agents failed (${r.status})`);
        setAgents(AgentInfoListSchema.parse(j));
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, [fetch]);

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const body = SpawnConsoleRequestSchema.parse({
        agent: choice?.id,
        ...(choice?.customId && { customId: choice.customId }),
        cwd,
        worktree: useWorktree ? name : undefined,
        prompt: prompt || undefined,
      });
      const res = await fetch("/api/consoles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `spawn failed (${res.status})`);
      onSpawned(ConsoleNodeSchema.parse(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const custom = agents.filter((a) => a.customId);
  const builtIn = agents.filter((a) => !a.customId);
  // Focus lands inside the modal, so the keyboard can reach it (a focused terminal keeps Tab).
  const first = [...builtIn, ...custom].find((a) => a.available);
  const row = (a: AgentInfo) => (
    <label key={keyOf(a)} className="agent-card">
      <input type="radio" name="agent" autoFocus={a === first} disabled={!a.available} checked={keyOf(choice) === keyOf(a)} onChange={() => setChoice(a)} />
      <span className={`agent-mark mark-${a.id}`} aria-hidden="true">
        {MARK[a.id] ?? (a.name ?? a.id).charAt(0).toUpperCase()}
      </span>
      <span className="agent-text">
        <span className="agent-name">{a.name ?? a.id}</span>
        <span className="agent-meta">{[a.available && a.version, SIGNAL[a.id]].filter(Boolean).join(" · ")}</span>
      </span>
      {!a.available && <span className="agent-status">not installed</span>}
      <span className={`agent-dot${a.available ? " is-ready" : ""}`} aria-hidden="true" />
    </label>
  );
  return (
    <form
      className="spawn"
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSpawn) submit(e);
      }}
    >
      <p className="spawn-sub">A real PTY with your login shell's environment. Auto-approve flags stay off.</p>
      <fieldset className="agent-list">
        <legend className="section-title">Agent</legend>
        {builtIn.map(row)}
      </fieldset>
      {custom.length > 0 && (
        <fieldset className="agent-list">
          <legend className="section-title">Custom agents</legend>
          {custom.map(row)}
        </fieldset>
      )}
      <fieldset className="spawn-where">
        <legend className="section-title">Where it runs</legend>
        <div className="where-row">
          <input type="radio" name="where" id={`${id}-root`} aria-describedby={`${id}-root-d`} checked={!useWorktree} onChange={() => setUseWorktree(false)} />
          <div className="where-text">
            <label htmlFor={`${id}-root`}>Repo root</label>
            <span id={`${id}-root-d`} className="where-path">
              {tilde(cwd)}
              {base && ` · ${base}`}
            </span>
          </div>
        </div>
        <div className="where-row">
          {/* The name stays "new worktree"; the base and the caption describe it. */}
          <input
            type="radio"
            name="where"
            id={`${id}-wt`}
            aria-labelledby={`${id}-wt-n`}
            aria-describedby={`${id}-wt-b ${id}-wt-d`}
            checked={useWorktree}
            onChange={() => setUseWorktree(true)}
          />
          <div className="where-text">
            <label htmlFor={`${id}-wt`}>
              <span id={`${id}-wt-n`} className="where-name">
                new worktree
              </span>{" "}
              from{" "}
              <span id={`${id}-wt-b`} className="chip">
                {base ?? "main"}
              </span>
            </label>
            <span id={`${id}-wt-d`} className="where-caption">
              so two agents never edit the same files
            </span>
          </div>
        </div>
        {useWorktree && (
          <div className="wt-branch">
            <input aria-label="branch name" placeholder="branch name" value={branch} onChange={(e) => setBranch(e.target.value)} />
            {/* The daemon puts the worktree at .worktrees/<name>, the name as given (git/service.ts worktreeAdd). */}
            <span className="wt-preview">→ .worktrees/{name}</span>
          </div>
        )}
      </fieldset>
      <label className="field">
        <span className="field-label">First prompt (optional)</span>
        <textarea aria-label="first prompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="spawn-footer">
        <p className="spawn-note">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 7.5 5.5 10.5 11.5 4" />
          </svg>
          Hooks post to 127.0.0.1 only. Your ~/.claude/settings.json is never edited.
        </p>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" aria-keyshortcuts="Meta+Enter" disabled={!canSpawn}>
          Spawn <kbd aria-hidden="true">⌘↵</kbd>
        </button>
      </div>
    </form>
  );
}
