import { useEffect, useState } from "react";
import {
  AgentInfoListSchema,
  ConsoleNodeSchema,
  SpawnConsoleRequestSchema,
  type ConsoleNode,
} from "@agentboard/shared";

type Agents = ReturnType<typeof AgentInfoListSchema.parse>;
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export function SpawnDialog({ fetch, cwd, onSpawned }: { fetch: Fetch; cwd: string; onSpawned: (n: ConsoleNode) => void }) {
  const [agents, setAgents] = useState<Agents>([]);
  const [agent, setAgent] = useState<string>("");
  const [useWorktree, setUseWorktree] = useState(false);
  const [branch, setBranch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((j) => setAgents(AgentInfoListSchema.parse(j)))
      .catch((e) => setError(String(e.message ?? e)));
  }, [fetch]);

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError("");
    try {
      const body = SpawnConsoleRequestSchema.parse({
        agent,
        cwd,
        worktree: useWorktree && branch ? branch : undefined,
        prompt: prompt || undefined,
      });
      const res = await fetch("/api/consoles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `spawn failed (${res.status})`);
      onSpawned(ConsoleNodeSchema.parse(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form onSubmit={submit}>
      {agents.map((a) => (
        <label key={a.id} style={{ display: "block", opacity: a.available ? 1 : 0.4 }}>
          <input type="radio" name="agent" value={a.id} disabled={!a.available} checked={agent === a.id} onChange={() => setAgent(a.id)} />
          {a.id} {a.version ?? "not installed"}
        </label>
      ))}
      <label>
        <input type="checkbox" checked={useWorktree} onChange={(e) => setUseWorktree(e.target.checked)} />
        new worktree
      </label>
      {useWorktree && <input aria-label="branch name" value={branch} onChange={(e) => setBranch(e.target.value)} />}
      <textarea aria-label="first prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <button type="submit" disabled={!agent}>Spawn</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
