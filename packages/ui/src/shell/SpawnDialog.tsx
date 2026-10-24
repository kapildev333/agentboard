import { useEffect, useState } from "react";
import {
  AgentInfoListSchema,
  ConsoleNodeSchema,
  SpawnConsoleRequestSchema,
  type AgentInfo,
  type ConsoleNode,
} from "@agentboard/shared";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export function SpawnDialog({ fetch, cwd, onSpawned, onCancel }: { fetch: Fetch; cwd: string; onSpawned: (n: ConsoleNode) => void; onCancel?: () => void }) {
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

  const row = (a: AgentInfo) => (
    <label key={keyOf(a)} className="agent-option">
      <input type="radio" name="agent" disabled={!a.available} checked={keyOf(choice) === keyOf(a)} onChange={() => setChoice(a)} />
      <span className="agent-name">{a.name ?? a.id}</span>
      <span className="agent-meta">{a.available ? a.version : "not installed"}</span>
    </label>
  );
  const custom = agents.filter((a) => a.customId);
  return (
    <form className="spawn" onSubmit={submit}>
      <fieldset className="agent-list">
        <legend className="section-title">Agent</legend>
        {agents.filter((a) => !a.customId).map(row)}
      </fieldset>
      {custom.length > 0 && (
        <fieldset className="agent-list">
          <legend className="section-title">Custom agents</legend>
          {custom.map(row)}
        </fieldset>
      )}
      <div className="spawn-worktree">
        <label className="check">
          <input type="checkbox" checked={useWorktree} onChange={(e) => setUseWorktree(e.target.checked)} />
          new worktree
        </label>
        {useWorktree && <input aria-label="branch name" placeholder="branch name" value={branch} onChange={(e) => setBranch(e.target.value)} />}
      </div>
      <div className="field">
        <span className="field-label">First prompt (optional)</span>
        <textarea aria-label="first prompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={!choice || busy || (useWorktree && !name)}>Spawn</button>
      </div>
    </form>
  );
}
