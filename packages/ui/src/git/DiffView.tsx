import { useEffect, useId, useState } from "react";
import { GitDiffSchema, type GitDiff } from "@agentboard/shared";
import { readJson } from "./http";

type FilePatch = { path: string; lines: string[] };

/** Splits a patch at each "diff --git" into the file's path and its lines from the first @@ on. */
export function splitPatch(patch: string): FilePatch[] {
  const files: FilePatch[] = [];
  let file: FilePatch | undefined;
  let inHunk = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      // ponytail: the path after the last " b/", so a path that itself holds " b/" is misread; fine for counts and selection.
      file = { path: line.slice(line.lastIndexOf(" b/") + 3), lines: [] };
      files.push(file);
      inHunk = false;
    } else if (line.startsWith("@@")) inHunk = true;
    if (file && inHunk) file.lines.push(line);
  }
  return files;
}

const count = (lines: string[], sign: string) => lines.filter((l) => l.startsWith(sign)).length;

function Lines({ lines }: { lines: string[] }) {
  let inHunk = false;
  let oldNo = 0;
  let newNo = 0;
  return (
    <pre className="diff">
      {lines.map((line, i) => {
        // ---/+++ are headers only before a file's first @@; "diff --git" starts the next file.
        if (line.startsWith("diff ")) inHunk = false;
        else if (line.startsWith("@@")) {
          inHunk = true;
          const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
          oldNo = Number(m?.[1] ?? 0);
          newNo = Number(m?.[2] ?? 0);
          return <div key={i} className="diff-hunk">{line}</div>;
        }
        const kind = !inHunk && (line.startsWith("+++") || line.startsWith("---")) ? undefined : line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : undefined;
        if (!inHunk) return <div key={i} className={kind}>{line}</div>;
        if (line === "") return null;
        const note = line.startsWith("\\");
        return (
          <div key={i} className={kind}>
            <span className="diff-ln">{kind === "added" || note ? "" : oldNo++}</span>
            <span className="diff-ln">{kind === "removed" || note ? "" : newNo++}</span>
            {line}
          </div>
        );
      })}
    </pre>
  );
}

export function DiffView({ fetch, path }: { fetch: typeof globalThis.fetch; path: string }) {
  const [diff, setDiff] = useState<GitDiff>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState(0);
  const titleId = useId();
  useEffect(() => {
    fetch(`/api/git/diff?path=${encodeURIComponent(path)}`)
      .then(readJson)
      .then((body) => setDiff(GitDiffSchema.parse(body)))
      .catch((e: Error) => setError(e.message));
  }, [fetch, path]);
  if (error) return <p role="alert">{error}</p>;
  if (!diff) return null;
  const patches = splitPatch(diff.patch);
  const patchOf = (p: string) => patches.find((f) => f.path === p);
  const file = diff.files[selected];
  const shown = file && patchOf(file.path);
  return (
    <div className="diff-view">
      <div className="diff-files" role="group" aria-labelledby={titleId}>
        <div id={titleId} className="field-label">Changed files</div>
        {diff.files.map((f, i) => {
          const p = patchOf(f.path);
          return (
            <button key={f.path} type="button" className="diff-file" aria-pressed={i === selected} onClick={() => setSelected(i)}>
              <span className="diff-file-status" data-change={f.status[0]}>{f.status}</span>
              <span className="diff-file-path" title={f.path}>{f.path}</span>
              {p && (
                <span className="diff-file-counts">
                  <span className="diff-count-added">+{count(p.lines, "+")}</span> <span className="diff-count-removed">−{count(p.lines, "-")}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="diff-pane">
        {shown && (
          <div className="diff-file-head">
            <span className="diff-file-path">{shown.path}</span>
            <span>unified · {count(shown.lines, "@@")} {count(shown.lines, "@@") === 1 ? "hunk" : "hunks"}</span>
          </div>
        )}
        {/* A patch without per-file headers, or a file it does not name, shows whole. */}
        <Lines lines={shown ? shown.lines : diff.patch.split("\n")} />
      </div>
    </div>
  );
}
