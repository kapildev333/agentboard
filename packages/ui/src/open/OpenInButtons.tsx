import { useState } from "react";

export type Editor = "code" | "zed" | "finder";

const EDITORS: { editor: Editor; label: string }[] = [
  { editor: "code", label: "VS Code" },
  { editor: "zed", label: "Zed" },
  { editor: "finder", label: "Finder" },
];

// Resolves to the daemon's error message, or null when the editor opened.
async function postOpen(editor: Editor, path: string, doFetch: typeof fetch): Promise<string | null> {
  const res = await doFetch("/api/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ editor, path }),
  });
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === "string" ? body.error : `open failed (${res.status})`;
}

export function OpenInButtons({ path, doFetch = fetch }: { path: string; doFetch?: typeof fetch }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="open-in">
      <span className="field-label">Open in</span>
      {EDITORS.map(({ editor, label }) => (
        <button
          key={editor}
          type="button"
          className="btn-sm"
          onClick={() => {
            postOpen(editor, path, doFetch).catch(() => "could not reach the daemon").then(setError);
          }}
        >
          {label}
        </button>
      ))}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
