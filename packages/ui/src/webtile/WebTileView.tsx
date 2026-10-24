import { useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import type { WebTileNode } from "@agentboard/shared";
import { useBoard } from "../board";
import "./webtile.css";

type Fetch = typeof globalThis.fetch;
type ConsoleLine = { level: string; text: string };
type NetLine = { method: string; url: string; status: number; ms: number };

const KEEP = 200;
const last = <T,>(xs: T[], x: T) => [...xs, x].slice(-KEEP);

export const isLocal = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
};

const setUrl = (id: string, url: string) =>
  useBoard.setState(({ board }) => ({
    board: {
      ...board,
      workspaces: board.workspaces.map((w) => ({ ...w, nodes: w.nodes.map((n) => (n.id === id && n.type === "webtile" ? { ...n, url } : n)) })),
    },
  }));

export function WebTileView(props: NodeProps & { fetch?: Fetch }) {
  const node = (props.data as { node: WebTileNode }).node;
  const doFetch = props.fetch ?? ((i, o) => globalThis.fetch(i, o));
  const frame = useRef<HTMLIFrameElement>(null);
  const [draft, setDraft] = useState(node.url);
  const [reloads, setReloads] = useState(0);
  const [previewKey, setPreviewKey] = useState<string>();
  const [capture, setCapture] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"console" | "network">("console");
  const [logs, setLogs] = useState<ConsoleLine[]>([]);
  const [net, setNet] = useState<NetLine[]>([]);

  useEffect(() => setDraft(node.url), [node.url]);
  // ponytail: asked once per tile; the Capture toggle appears when the preview proxy exists and stays hidden on a 404.
  useEffect(() => {
    let live = true;
    doFetch("/api/preview")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { key?: string } | null) => live && b?.key && setPreviewKey(b.key))
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || !frame.current || e.source !== frame.current.contentWindow) return;
      const m = e.data as { agentboard?: string; level?: string; text?: string; method?: string; url?: string; status?: number; ms?: number } | null;
      if (m?.agentboard === "console") setLogs((l) => last(l, { level: String(m.level), text: String(m.text) }));
      else if (m?.agentboard === "network") setNet((l) => last(l, { method: String(m.method), url: String(m.url), status: Number(m.status), ms: Number(m.ms) }));
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

  const commit = () => {
    if (draft !== node.url) setUrl(node.id, draft);
  };
  const ok = isLocal(node.url);
  const src = capture && previewKey ? `/preview/${previewKey}/${encodeURIComponent(node.url)}` : node.url;
  const errors = logs.filter((l) => l.level === "error").length;
  return (
    <div className="card webtile">
      <div className="webtile-bar nodrag">
        <input
          aria-label="Address"
          className="webtile-address"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          onBlur={commit}
        />
        <button type="button" className="btn-sm" onClick={() => setReloads(reloads + 1)}>Reload</button>
        <a className="btn-sm" href={node.url} target="_blank" rel="noopener">Open</a>
        {previewKey && (
          <button type="button" className="btn-sm" aria-pressed={capture} onClick={() => setCapture(!capture)}>Capture</button>
        )}
      </div>
      {ok ? (
        <iframe
          key={reloads}
          ref={frame}
          className="webtile-frame nodrag nowheel"
          title={`Preview of ${node.url}`}
          src={src}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      ) : (
        <p className="webtile-hint muted">Only localhost URLs load here</p>
      )}
      <div className="webtile-inspector nodrag nowheel">
        <div className="webtile-bar">
          <button type="button" className="btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
            Inspector{errors > 0 && <span className="webtile-badge"> {errors}</span>}
          </button>
          {open && (
            <>
              <div role="tablist" className="webtile-tabs">
                {(["console", "network"] as const).map((t) => (
                  <button key={t} type="button" role="tab" className="btn-sm" aria-selected={tab === t} onClick={() => setTab(t)}>
                    {t === "console" ? "Console" : "Network"}
                  </button>
                ))}
              </div>
              <button type="button" className="btn-sm" onClick={() => (setLogs([]), setNet([]))}>Clear</button>
            </>
          )}
        </div>
        {open && (
          <ul className="webtile-log">
            {tab === "console"
              ? logs.map((l, i) => (
                  <li key={i} className={`webtile-${l.level}`}>
                    <span className="webtile-level">{l.level}</span> <span>{l.text}</span>
                  </li>
                ))
              : net.map((r, i) => (
                  <li key={i}>
                    <span className="webtile-level">{r.method}</span> <span>{r.url}</span> <span className="muted">{r.status} · {r.ms} ms</span>
                  </li>
                ))}
          </ul>
        )}
      </div>
    </div>
  );
}
