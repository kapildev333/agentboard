import { useCallback, useEffect, useId, useRef, useState } from "react";
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
import { OpenInButtons } from "../open/OpenInButtons";
import { DiffView } from "./DiffView";
import { readJson } from "./http";
import "../styles/git.css";

/** How long ago an ISO date was: "12m" under an hour, "3h" under a day, then "2d". */
export function formatAge(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / (24 * 60))}d`;
}

export function GitCard({
  fetch,
  path,
  base,
  intervalMs = 10_000,
}: {
  fetch: typeof globalThis.fetch;
  path: string;
  /** The branch this worktree was cut from; the head row leaves "from" out without one. */
  base?: string;
  intervalMs?: number;
}) {
  const [status, setStatus] = useState<GitStatus>();
  const [showDiff, setShowDiff] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [message, setMessage] = useState("");
  const messageId = useId();
  const [error, setError] = useState<string>();
  const [statusError, setStatusError] = useState<string>();
  // The PR url is shown as a link: a window.open after the reply is not a user gesture, so browsers block it.
  const [prUrl, setPrUrl] = useState<string>();
  // A ref, not state, so a second click in the same tick already sees the first one in flight.
  const busy = useRef(false);
  const [busyShown, setBusy] = useState(false);
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
  const openIn = <OpenInButtons path={path} doFetch={fetch} />;
  // Open in still works on a folder that is not a repo.
  if (!status)
    return statusError ? (
      <div className="git-card">
        <p role="alert">{statusError}</p>
        <div className="git-actions">{openIn}</div>
      </div>
    ) : null;
  const last = status.lastCommit;
  return (
    <div className="git-card">
      <div className="git-head">
        <b className="chip git-branch">{status.branch}</b>
        {base && (
          <>
            <span className="git-from">from</span>
            <span className="chip git-base">{base}</span>
          </>
        )}
        <span className={status.ahead > 0 ? "git-stat ahead" : "git-stat"}>ahead {status.ahead}</span>
        <span className="git-stat">behind {status.behind}</span>
        <span className={status.dirty > 0 ? "git-stat dirty" : "git-stat"}>dirty {status.dirty}</span>
        {last && (
          <span className="git-last" title={last.subject}>
            <code className="git-sha">{last.sha.slice(0, 7)}</code> · <span className="git-subject">{last.subject}</span>
            {/* GitStatus carries no date yet; the age shows once it does. */}
            {"date" in last && typeof last.date === "string" && <span className="git-age"> · {formatAge(last.date)}</span>}
          </span>
        )}
      </div>
      <div className="git-actions">
        <button className="btn-sm" aria-pressed={showDiff} onClick={() => setShowDiff(!showDiff)}>Diff</button>
        <button className="btn-sm" aria-pressed={committing} onClick={() => setCommitting(!committing)}>Commit</button>
        <button className="btn-sm" disabled={busyShown} onClick={() => post("push", PushRequestSchema, OkSchema, { path })}>Push</button>
        <button
          className="btn-sm"
          disabled={busyShown}
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
          Open PR <span className="git-hint" aria-hidden="true">gh</span>
        </button>
        <span className="git-divider" aria-hidden="true" />
        {openIn}
      </div>
      {committing && (
        <form
          className="git-commit"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await post("commit", CommitRequestSchema, CommitResponseSchema, { path, message })) {
              setCommitting(false);
              setMessage("");
            }
          }}
        >
          <label className="field-label" htmlFor={messageId}>Commit message</label>
          <textarea id={messageId} required rows={3} placeholder="Describe the change" value={message} onChange={(e) => setMessage(e.target.value)} />
          <button type="submit" className="btn-primary" disabled={busyShown || status.dirty === 0}>
            {status.dirty === 0 ? "Commit" : `Commit ${status.dirty} ${status.dirty === 1 ? "file" : "files"}`}
          </button>
        </form>
      )}
      {prUrl && (
        <p className="git-pr">
          <a href={prUrl} target="_blank" rel="noopener noreferrer">{prUrl}</a>
        </p>
      )}
      {(error ?? statusError) && <p role="alert">{error ?? statusError}</p>}
      {showDiff && <DiffView fetch={fetch} path={path} />}
    </div>
  );
}
