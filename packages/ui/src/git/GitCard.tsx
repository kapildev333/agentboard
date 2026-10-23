import { useEffect, useState } from "react";
import {
  CommitRequestSchema,
  CommitResponseSchema,
  GitStatusSchema,
  OkSchema,
  PrRequestSchema,
  PrResponseSchema,
  PushRequestSchema,
  type GitStatus,
} from "@agentboard/shared";
import { DiffView } from "./DiffView";
import { readJson } from "./http";

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
  const [status, setStatus] = useState<GitStatus>();
  const [showDiff, setShowDiff] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string>();
  // Validates the request body and the reply; shows any failure inline and returns undefined.
  const post = async <T,>(route: string, request: { parse(b: unknown): unknown }, reply: { parse(b: unknown): T }, body: unknown) => {
    setError(undefined);
    try {
      const res = await fetch(`/api/git/${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.parse(body)),
      });
      return reply.parse(await readJson(res));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/git/status?path=${encodeURIComponent(path)}`);
        setStatus(GitStatusSchema.parse(await readJson(res)));
        setError(undefined);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    void load();
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
  }, [fetch, path, intervalMs]);
  if (!status) return error ? <p role="alert">{error}</p> : null;
  return (
    <div>
      <b>{status.branch}</b> <span>ahead {status.ahead}</span> <span>behind {status.behind}</span>{" "}
      <span>dirty {status.dirty}</span> <span>{status.lastCommit?.subject}</span>
      <div>
        <button onClick={() => setShowDiff(!showDiff)}>Diff</button>
        <button onClick={() => setCommitting(!committing)}>Commit</button>
        <button onClick={() => post("push", PushRequestSchema, OkSchema, { path })}>Push</button>
        <button
          onClick={async () => {
            const pr = await post("pr", PrRequestSchema, PrResponseSchema, {
              path,
              title: status.lastCommit?.subject ?? status.branch,
            });
            if (!pr) return;
            if (/^https?:\/\//.test(pr.url)) open(pr.url);
            else setError("PR url is not http(s)");
          }}
        >
          Open PR
        </button>
      </div>
      {committing && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await post("commit", CommitRequestSchema, CommitResponseSchema, { path, message })) {
              setCommitting(false);
              setMessage("");
            }
          }}
        >
          <input required aria-label="Commit message" value={message} onChange={(e) => setMessage(e.target.value)} />
          <button type="submit">Submit</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {showDiff && <DiffView fetch={fetch} path={path} />}
    </div>
  );
}
