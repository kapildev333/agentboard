import { createElement, useState } from "react";

export type Editor = "code" | "zed" | "finder";

const EDITORS: { editor: Editor; label: string }[] = [
  { editor: "code", label: "VS Code" },
  { editor: "zed", label: "Zed" },
  { editor: "finder", label: "Finder" },
];

// Resolves to the daemon's error message, or null when the editor opened.
export async function postOpen(editor: Editor, path: string, doFetch: typeof fetch = fetch): Promise<string | null> {
  const res = await doFetch("/api/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ editor, path }),
  });
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === "string" ? body.error : `open failed (${res.status})`;
}

// Stateless so a test can call it and click the returned buttons without a DOM.
export function OpenInMenu({ error, onOpen }: { error: string | null; onOpen: (editor: Editor) => void }) {
  return createElement(
    "div",
    null,
    ...EDITORS.map(({ editor, label }) => createElement("button", { key: editor, type: "button", onClick: () => onOpen(editor) }, label)),
    error ? createElement("p", { role: "alert" }, error) : null,
  );
}

export function OpenInButtons({ path, doFetch }: { path: string; doFetch?: typeof fetch }) {
  const [error, setError] = useState<string | null>(null);
  return OpenInMenu({
    error,
    onOpen: (editor) => {
      postOpen(editor, path, doFetch).catch(() => "could not reach the daemon").then(setError);
    },
  });
}
