import { useEffect, useState } from "react";
import { GitDiffSchema } from "@agentboard/shared";

type Diff = ReturnType<typeof GitDiffSchema.parse>;

export function DiffView({ fetch, path }: { fetch: typeof globalThis.fetch; path: string }) {
  const [diff, setDiff] = useState<Diff>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    fetch(`/api/git/diff?path=${encodeURIComponent(path)}`)
      .then((res) => res.json())
      .then((body) => setDiff(GitDiffSchema.parse(body)))
      .catch((e: Error) => setError(e.message));
  }, [fetch, path]);
  if (error) return <p role="alert">{error}</p>;
  if (!diff) return null;
  return (
    <div>
      <ul>
        {diff.files.map((f) => (
          <li key={f.path}>
            <span>{f.status}</span> <span>{f.path}</span>
          </li>
        ))}
      </ul>
      <pre style={{ fontFamily: "monospace" }}>
        {diff.patch.split("\n").map((line, i) => (
          <div key={i} className={line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : undefined}>
            {line}
          </div>
        ))}
      </pre>
    </div>
  );
}
