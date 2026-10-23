import { useEffect, useState } from "react";
import { GitDiffSchema, type GitDiff } from "@agentboard/shared";
import { readJson } from "./http";

const colors = { added: "#1a7f37", removed: "#cf222e" };

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
        {diff.patch.split("\n").map((line, i) => {
          const header = line.startsWith("+++") || line.startsWith("---");
          const kind = header ? undefined : line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : undefined;
          return (
            <div key={i} className={kind} style={kind ? { color: colors[kind] } : undefined}>
              {line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
