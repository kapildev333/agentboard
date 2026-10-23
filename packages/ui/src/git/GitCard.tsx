import { useEffect, useState } from "react";
import { GitStatusSchema, PrResponseSchema } from "@agentboard/shared";
import { DiffView } from "./DiffView";

type Status = ReturnType<typeof GitStatusSchema.parse>;

export function GitCard({
  fetch,
  path,
  intervalMs = 10_000,
  open = (url) => void window.open(url, "_blank", "noopener"),
}: {
  fetch: typeof globalThis.fetch;
  path: string;
  intervalMs?: number;
  open?: (url: string) => void;
}) {
  const [status, setStatus] = useState<Status>();
  const [showDiff, setShowDiff] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string>();
  const post = async (route: string, body: object) => {
    setError(undefined);
    try {
      const res = await fetch(`/api/git/${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/git/status?path=${encodeURIComponent(path)}`);
      setStatus(GitStatusSchema.parse(await res.json()));
    };
    void load();
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
  }, [fetch, path, intervalMs]);
  if (!status) return null;
  return (
    <div>
      <b>{status.branch}</b> <span>ahead {status.ahead}</span> <span>behind {status.behind}</span>{" "}
      <span>dirty {status.dirty}</span> <span>{status.lastCommit?.subject}</span>
      <div>
        <button onClick={() => setShowDiff(!showDiff)}>Diff</button>
        <button onClick={() => setCommitting(!committing)}>Commit</button>
        <button onClick={() => post("push", { path })}>Push</button>
        <button
          onClick={async () => {
            const pr = await post("pr", { path, title: status.lastCommit?.subject ?? status.branch });
            if (pr) open(PrResponseSchema.parse(pr).url);
          }}
        >
          Open PR
        </button>
      </div>
      {committing && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await post("commit", { path, message })) {
              setCommitting(false);
              setMessage("");
            }
          }}
        >
          <input aria-label="Commit message" value={message} onChange={(e) => setMessage(e.target.value)} />
          <button type="submit">Submit</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {showDiff && <DiffView fetch={fetch} path={path} />}
    </div>
  );
}
