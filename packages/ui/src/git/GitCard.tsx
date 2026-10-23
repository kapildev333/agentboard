import { useCallback, useEffect, useRef, useState } from "react";
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
}: {
  fetch: typeof globalThis.fetch;
  path: string;
  intervalMs?: number;
}) {
  const [status, setStatus] = useState<GitStatus>();
  const [showDiff, setShowDiff] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string>();
  const [statusError, setStatusError] = useState<string>();
  // The PR url is shown as a link: a window.open after the reply is not a user gesture, so browsers block it.
  const [prUrl, setPrUrl] = useState<string>();
  // A ref, not state, so a second click in the same tick already sees the first one in flight.
  const busy = useRef(false);
  const [, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/git/status?path=${encodeURIComponent(path)}`);
      setStatus(GitStatusSchema.parse(await readJson(res)));
      setStatusError(undefined);
    } catch (e) {
      setStatusError((e as Error).message);
    }
  }, [fetch, path]);
  // Validates the request body and the reply; shows any failure inline and returns undefined.
  // One action at a time; a success reloads the status so ahead and dirty refresh.
  const post = async <T,>(route: string, request: { parse(b: unknown): unknown }, reply: { parse(b: unknown): T }, body: unknown) => {
    if (busy.current) return;
    busy.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/git/${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.parse(body)),
      });
      const out = reply.parse(await readJson(res));
      if (route !== "pr") void load();
      return out;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
  }, [load, intervalMs]);
  if (!status) return statusError ? <p role="alert">{statusError}</p> : null;
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
            if (/^https?:\/\//.test(pr.url)) setPrUrl(pr.url);
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
      {prUrl && (
        <p>
          <a href={prUrl} target="_blank" rel="noopener noreferrer">{prUrl}</a>
        </p>
      )}
      {(error ?? statusError) && <p role="alert">{error ?? statusError}</p>}
      {showDiff && <DiffView fetch={fetch} path={path} />}
    </div>
  );
}
