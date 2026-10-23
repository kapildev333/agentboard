import { createContext, useContext, useEffect, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { BoardSchema, SettingsSchema, parseDaemonMessage, type Board as BoardData, type ConsoleNode as ConsoleData, type NoteNode, type Settings } from "@agentboard/shared";
import { Board, WorkspaceTabs, autosaveBoard, useBoard } from "./board";
import { ConsoleNode, type SocketLike } from "./console";
import { GitCard } from "./git";
import { OpenInButtons } from "./open/OpenInButtons";
import { RepoPicker, SettingsPanel, SpawnDialog } from "./shell";
import { MissionMap, StatusBadge, useNotifications } from "./status";

type Fetch = typeof globalThis.fetch;
const Api = createContext<{ fetch: Fetch; fontSize: number }>({ fetch: globalThis.fetch, fontSize: 13 });

const RECENT = "agentboard.recent";
const consoles = (b: BoardData) => b.workspaces.flatMap((w) => w.nodes).filter((n): n is ConsoleData => n.type === "console");
const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const defaultConnect = (): SocketLike =>
  new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`) as unknown as SocketLike;

/**
 * Folds a board the daemon broadcast into the page's: the daemon owns each console's status and session, and
 * consoles it started elsewhere (CLI, MCP) are added. Layout stays the page's. A board with no unsaved local
 * edit stays unsaved, so a status change never triggers a PUT.
 */
export function mergeDaemonBoard(daemon: BoardData, closed: Set<string>): void {
  const { board, loaded } = useBoard.getState();
  if (daemon.repoPath !== board.repoPath) return;
  const theirs = new Map(consoles(daemon).map((n) => [n.id, n]));
  let changed = false;
  let workspaces = board.workspaces.map((ws) => {
    let touched = false;
    const nodes = ws.nodes.map((n) => {
      if (n.type !== "console") return n;
      const t = theirs.get(n.id);
      theirs.delete(n.id);
      if (!t || (t.status === n.status && t.session?.id === n.session?.id)) return n;
      touched = true;
      return { ...n, status: t.status, session: t.session, lastActiveAt: t.lastActiveAt };
    });
    if (!touched) return ws;
    changed = true;
    return { ...ws, nodes };
  });
  for (const t of theirs.values()) {
    if (closed.has(t.id)) continue;
    const home = daemon.workspaces.find((w) => w.nodes.some((n) => n.id === t.id))?.id;
    const target = workspaces.find((w) => w.id === home) ?? workspaces.find((w) => w.id === board.activeWorkspaceId) ?? workspaces[0];
    if (!target) continue;
    workspaces = workspaces.map((w) => (w === target ? { ...w, nodes: [...w.nodes, t] } : w));
    changed = true;
  }
  if (!changed) return;
  const next = { ...board, workspaces };
  useBoard.setState(board === loaded ? { board: next, loaded: next } : { board: next });
}

function ConsoleView(props: NodeProps) {
  const node = (props.data as { node: ConsoleData }).node;
  const { fetch, fontSize } = useContext(Api);
  const [git, setGit] = useState(false);
  const [error, setError] = useState<string>();
  const resume = async () => {
    setError(undefined);
    const res = await fetch(`/api/consoles/${encodeURIComponent(node.id)}/resume`, { method: "POST" }).catch(() => null);
    if (!res?.ok) setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "could not resume");
  };
  const stopped = node.status === "stopped" || node.status === "exited";
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ConsoleNode data={{ node }} fontSize={fontSize} statusBadge={<StatusBadge status={node.status} />} />
      </div>
      <div className="nodrag" style={{ display: "flex", gap: 4, padding: 4, borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
        {stopped && <button type="button" onClick={() => void resume()}>Resume</button>}
        <button type="button" aria-pressed={git} onClick={() => setGit(!git)}>Git</button>
        <button type="button" aria-label={`Close ${node.title}`} onClick={() => useBoard.getState().removeNode(node.id)}>
          Close
        </button>
        {error && <span role="alert">{error}</span>}
      </div>
      {git && (
        <div className="nodrag nowheel" style={{ maxHeight: "50%", overflow: "auto", padding: 4, borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
          <GitCard fetch={fetch} path={node.cwd} />
          <OpenInButtons path={node.cwd} doFetch={fetch} />
        </div>
      )}
    </div>
  );
}

function NoteView(props: NodeProps) {
  const node = (props.data as { node: NoteNode }).node;
  return <div style={{ width: "100%", height: "100%", background: "#fef9c3", padding: 8, whiteSpace: "pre-wrap", overflow: "auto" }}>{node.text}</div>;
}

// Module-level so React Flow never remounts the nodes (and their terminals) on a render.
const nodeTypes = { console: ConsoleView, note: NoteView };

const focusNode = (id: string) => {
  const el = document.querySelector<HTMLElement>(`[data-testid="node-${CSS.escape(id)}"]`);
  el?.scrollIntoView?.({ block: "nearest" });
  el?.querySelector<HTMLElement>("textarea")?.focus();
};

// Stable, so effects keyed on fetch (the spawn dialog's agent list, the git card) run once.
const browserFetch: Fetch = (input, init) => globalThis.fetch(input, init);

export function App({ fetch = browserFetch, search = location.search, connect = defaultConnect }: { fetch?: Fetch; search?: string; connect?: () => SocketLike }) {
  const repo = new URLSearchParams(search).get("repo");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [settings, setSettings] = useState<Settings>({ fontSize: 13, customAgents: [] });
  const [panel, setPanel] = useState<"spawn" | "settings" | null>(null);
  useNotifications({ onFocus: focusNode });

  useEffect(() => {
    if (!repo) return;
    let live = true;
    const closed = new Set<string>();
    const cleanups: (() => void)[] = [];
    (async () => {
      const res = await fetch(`/api/board?repo=${encodeURIComponent(repo)}`);
      if (res.status === 401 || res.status === 403) throw new Error("Not logged in: run `agentboard open` in the repo to get a fresh login link.");
      if (!res.ok) throw new Error(`could not load the board (${res.status})`);
      const board = BoardSchema.parse(await res.json());
      if (!live) return;
      useBoard.getState().setBoard(board);
      localStorage.setItem(RECENT, JSON.stringify([repo, ...readRecent().filter((r) => r !== repo)].slice(0, 10)));
      setReady(true);
      cleanups.push(
        autosaveBoard((b) => {
          void fetch("/api/board", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
        }),
        // A console that leaves the board (Close, delete key, workspace delete) is ended by the daemon.
        useBoard.subscribe((s, prev) => {
          if (s.board === prev.board || s.board.repoPath !== prev.board.repoPath) return;
          const now = new Set(consoles(s.board).map((n) => n.id));
          for (const n of consoles(prev.board))
            if (!now.has(n.id) && !closed.has(n.id)) {
              closed.add(n.id);
              void fetch(`/api/consoles/${encodeURIComponent(n.id)}`, { method: "DELETE" });
            }
        }),
      );
      const open = () => {
        const s = connect();
        s.onmessage = (e) => {
          try {
            const m = parseDaemonMessage(JSON.parse(String(e.data)));
            if (m.t === "board") mergeDaemonBoard(m.board, closed);
          } catch {
            // not a board message
          }
        };
        // A restarted daemon listens on a new port with a new token, so this tab cannot reconnect; say so
        // rather than keep showing statuses nobody updates. A dropped socket to a live daemon reconnects.
        s.onclose = () => {
          if (!live) return;
          fetch("/api/status")
            .then((r) => (r.ok ? void setTimeout(open, 1000) : Promise.reject(new Error(String(r.status)))))
            .catch(() => live && setError("The daemon stopped. Run `agentboard open` in the repo to reopen the board."));
        };
        cleanups.push(() => s.close());
      };
      open();
      const sres = await fetch("/api/settings").catch(() => null);
      if (live && sres?.ok) setSettings(SettingsSchema.parse(await sres.json()));
    })().catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
      cleanups.forEach((f) => f());
    };
  }, [repo, fetch, connect]);

  const go = (path: string) => (location.search = `?repo=${encodeURIComponent(path)}`);
  if (error) return <p role="alert" style={{ padding: 16 }}>{error}</p>;
  if (!repo) return <main style={{ padding: 16 }}><h1>AgentBoard</h1><RepoPicker recent={readRecent()} onOpen={go} /></main>;

  const saveSettings = (s: Settings) => {
    setSettings(s);
    void fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
  };
  return (
    <Api.Provider value={{ fetch, fontSize: settings.fontSize }}>
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gridTemplateColumns: "1fr 240px", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
        <header style={{ gridColumn: "1 / 3", display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderBottom: "1px solid #d1d5db" }}>
          <strong title={repo}>{repo.split("/").pop()}</strong>
          {ready && <WorkspaceTabs />}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => setPanel(panel === "spawn" ? null : "spawn")}>Spawn console</button>
          <button type="button" onClick={() => setPanel(panel === "settings" ? null : "settings")}>Settings</button>
        </header>
        <main style={{ position: "relative", minHeight: 0 }}>
          {ready ? <Board nodeTypes={nodeTypes} /> : <p style={{ padding: 16 }}>Loading the board…</p>}
          {panel && (
            <div role="dialog" aria-label={panel === "spawn" ? "Spawn console" : "Settings"} style={{ position: "absolute", top: 8, right: 8, zIndex: 10, background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, padding: 12, minWidth: 320 }}>
              {panel === "spawn" ? (
                <SpawnDialog
                  fetch={fetch}
                  cwd={repo}
                  onSpawned={(n) => {
                    const { board, addNode } = useBoard.getState();
                    if (!consoles(board).some((c) => c.id === n.id)) addNode(n);
                    setPanel(null);
                  }}
                />
              ) : (
                <SettingsPanel settings={settings} onChange={saveSettings} />
              )}
            </div>
          )}
        </main>
        <div style={{ borderLeft: "1px solid #d1d5db", overflow: "auto", padding: 8 }}>
          <MissionMap onFocus={focusNode} />
        </div>
      </div>
    </Api.Provider>
  );
}
