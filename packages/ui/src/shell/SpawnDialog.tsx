import { useEffect, useState } from "react";
import {
  AgentInfoListSchema,
  ConsoleNodeSchema,
  SpawnConsoleRequestSchema,
  type AgentInfo,
  type ConsoleNode,
} from "@agentboard/shared";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export function SpawnDialog({ fetch, cwd, onSpawned }: { fetch: Fetch; cwd: string; onSpawned: (n: ConsoleNode) => void }) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  // A custom entry is told apart by its customId; built-in ids are unique on their own.
  const [choice, setChoice] = useState<AgentInfo>();
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

  return (
    <form onSubmit={submit}>
      <fieldset>
        <legend>Agent</legend>
        {agents.map((a) => (
        <label key={`${a.id}:${a.customId ?? ""}`} style={{ display: "block", opacity: a.available ? 1 : 0.4 }}>
          <input type="radio" name="agent" disabled={!a.available} checked={choice === a} onChange={() => setChoice(a)} />
          {a.name ?? a.id} {a.available ? a.version : "not installed"}
        </label>
        ))}
      </fieldset>
      <label>
        <input type="checkbox" checked={useWorktree} onChange={(e) => setUseWorktree(e.target.checked)} />
        new worktree
      </label>
      {useWorktree && <input aria-label="branch name" value={branch} onChange={(e) => setBranch(e.target.value)} />}
      <textarea aria-label="first prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <button type="submit" disabled={!choice || busy || (useWorktree && !name)}>Spawn</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
