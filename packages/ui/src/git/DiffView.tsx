import { useEffect, useId, useState, type ReactNode } from "react";
import { GitDiffSchema, type GitDiff } from "@agentboard/shared";
import { readJson } from "./http";

/** `header` holds the lines between "diff --git" and the first @@ (mode, rename, "Binary files … differ"); `lines` the hunks. */
type FilePatch = { path: string; header: string[]; lines: string[] };

const ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };

/** Git C-quotes a path holding non-ASCII or special bytes ("caf\303\251"); this returns it as text. Unquoted paths pass through. */
export function unquotePath(path: string): string {
  if (!(path.startsWith('"') && path.endsWith('"'))) return path;
  const bytes: number[] = [];
  const s = path.slice(1, -1);
  for (let i = 0; i < s.length; i++) {
    const octal = s.slice(i + 1, i + 4);
    if (s[i] !== "\\") bytes.push(...new TextEncoder().encode(s[i]));
    else if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(parseInt(octal, 8));
      i += 3;
    } else {
      i++;
      bytes.push(ESCAPES[s[i]!] ?? s.charCodeAt(i));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Splits a patch at each "diff --git" into the file's path, its header lines and its hunk lines. */
export function splitPatch(patch: string): FilePatch[] {
  const files: FilePatch[] = [];
  let file: FilePatch | undefined;
  let inHunk = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      // ponytail: the new path is the last token, quoted ("b/…") or after the last " b/"; an unquoted path that itself holds " b/" is misread.
      const quoted = /"b\/((?:[^"\\]|\\.)*)"$/.exec(line);
      const path = quoted ? unquotePath(`"${quoted[1]}"`) : line.slice(line.lastIndexOf(" b/") + 3);
      file = { path, header: [], lines: [] };
      files.push(file);
      inHunk = false;
      continue;
    }
    if (line.startsWith("@@")) inHunk = true;
    if (file && (inHunk || line !== "")) (inHunk ? file.lines : file.header).push(line);
  }
  return files;
}

const CHANGES: Record<string, string> = { M: "modified", A: "added", D: "deleted", R: "renamed", C: "copied", T: "type changed", U: "unmerged" };

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

/** `footer` (the commit form) sits under the changed files, and stays shown while the diff loads or fails. */
export function DiffView({ fetch, path, footer }: { fetch: typeof globalThis.fetch; path: string; footer?: ReactNode }) {
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
  if (error)
    return (
      <>
        <p role="alert">{error}</p>
        {footer}
      </>
    );
  if (!diff) return footer ?? null;
  const patches = splitPatch(diff.patch);
  const patchOf = (p: string) => patches.find((f) => f.path === unquotePath(p));
  const file = diff.files[selected];
  const shown = file && patchOf(file.path);
  const hunks = shown ? count(shown.lines, "@@") : 0;
  return (
    <div className="diff-view">
      <div className="diff-files" role="group" aria-labelledby={titleId}>
        <div id={titleId} className="section-title">Changed files</div>
        <ul className="diff-files-list">
          {diff.files.map((f, i) => {
            const p = patchOf(f.path);
            const name = unquotePath(f.path);
            // A file without hunks (binary, pure rename, mode change) has no line counts.
            const counts = p?.lines.length ? { added: count(p.lines, "+"), removed: count(p.lines, "-") } : undefined;
            const label = [name, CHANGES[f.status[0]!] ?? f.status, ...(counts ? [`${counts.added} added`, `${counts.removed} removed`] : [])].join(", ");
            return (
              <li key={f.path}>
                <button type="button" className="diff-file" aria-label={label} aria-pressed={i === selected} onClick={() => setSelected(i)}>
                  <span className="diff-file-status" data-change={f.status[0]}>{f.status}</span>
                  <span className="diff-file-path" title={name}>{name}</span>
                  {counts && (
                    <span className="diff-file-counts">
                      <span className="diff-count-added">+{counts.added}</span> <span className="diff-count-removed">−{counts.removed}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {footer}
      </div>
      <div className="diff-pane">
        {shown && (
          <div className="diff-file-head">
            <span className="diff-file-path">{shown.path}</span>
            {hunks > 0 && <span>unified · {hunks} {hunks === 1 ? "hunk" : "hunks"}</span>}
          </div>
        )}
        {/* A file without hunks shows its header lines; a patch without per-file headers, or a file it does not name, shows whole. */}
        <Lines lines={shown ? (hunks ? shown.lines : shown.header) : diff.patch.split("\n")} />
      </div>
    </div>
  );
}
