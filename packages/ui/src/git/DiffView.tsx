import { useEffect, useState } from "react";
import { GitDiffSchema, type GitDiff } from "@agentboard/shared";
import { readJson } from "./http";

export function DiffView({ fetch, path }: { fetch: typeof globalThis.fetch; path: string }) {
  const [diff, setDiff] = useState<GitDiff>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    fetch(`/api/git/diff?path=${encodeURIComponent(path)}`)
      .then(readJson)
      .then((body) => setDiff(GitDiffSchema.parse(body)))
      .catch((e: Error) => setError(e.message));
  }, [fetch, path]);
  if (error) return <p role="alert">{error}</p>;
  if (!diff) return null;
  let inHunk = false;
  return (
    <div className="diff-view">
      <ul className="diff-files">
        {diff.files.map((f) => (
          <li key={f.path}>
            <span className="diff-file-status">{f.status}</span> <span className="diff-file-path">{f.path}</span>
          </li>
        ))}
      </ul>
      <pre className="diff">
        {diff.patch.split("\n").map((line, i) => {
          // ---/+++ are headers only before a file's first @@; "diff --git" starts the next file.
          if (line.startsWith("diff ")) inHunk = false;
          else if (line.startsWith("@@")) inHunk = true;
          const header = !inHunk && (line.startsWith("+++") || line.startsWith("---"));
          const kind = header ? undefined : line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : undefined;
          return (
            <div key={i} className={kind}>
              {line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
