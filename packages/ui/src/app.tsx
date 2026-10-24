import { createContext, useContext, useEffect, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { BoardSchema, PutBoardResponseSchema, SettingsSchema, parseDaemonMessage, type Board as BoardData, type BoardNode, type ConsoleNode as ConsoleData, type NoteNode, type Settings } from "@agentboard/shared";
import { Board, WorkspaceTabs, autosaveBoard, useBoard } from "./board";
import { ConsoleNode, type SocketLike } from "./console";
import { GitCard } from "./git";
import { OpenInButtons } from "./open/OpenInButtons";
import { RepoPicker, SettingsPanel, SpawnDialog } from "./shell";
import { MissionMap, StatusBadge, useNotifications } from "./status";
import { WebTileView } from "./webtile";

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
const defaultConnect = (client: string): SocketLike =>
  new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?client=${client}`) as unknown as SocketLike;

/**
 * Folds a board the daemon broadcast into the page's. The daemon owns each console's status and session, the
 * nodes added or removed elsewhere (CLI, MCP) and their content (a note's text); the page keeps positions,
 * sizes and the viewport, and nodes it added or removed since it last synced. A board with no unsaved local
 * edit stays unsaved, so a status change never triggers a PUT.
 */
export function mergeDaemonBoard(daemon: BoardData, closed: Set<string>): void {
  const { board, loaded } = useBoard.getState();
  if (daemon.repoPath !== board.repoPath) return;
  // Ids the daemon knew when the page last synced: one of these missing from the page was removed here.
  const known = new Map(loaded.workspaces.flatMap((w) => w.nodes).map((n) => [n.id, n]));
  const theirs = new Map(daemon.workspaces.flatMap((w) => w.nodes).map((n) => [n.id, n]));
  let changed = false;
  let workspaces = board.workspaces.map((ws) => {
    let touched = false;
    const nodes = ws.nodes.flatMap((n): BoardNode[] => {
      const t = theirs.get(n.id);
      theirs.delete(n.id);
      if (!t) {
        if (n.type === "console" || !known.has(n.id)) return [n];
        touched = true;
        return [];
      }
      if (n.type === "console") {
        if (t.type !== "console" || (t.status === n.status && t.session?.id === n.session?.id)) return [n];
        touched = true;
        return [{ ...n, status: t.status, session: t.session, lastActiveAt: t.lastActiveAt }];
      }
      // Position and size are the page's only while it has moved the node since it last synced; otherwise another tab's win.
      const base = known.get(n.id);
      const moved = base && (n.x !== base.x || n.y !== base.y || n.w !== base.w || n.h !== base.h);
      const merged = { ...t, ...(moved ? { x: n.x, y: n.y, w: n.w, h: n.h } : {}) };
      if (JSON.stringify(merged) === JSON.stringify(n)) return [n];
      touched = true;
      return [merged];
    });
    if (!touched) return ws;
    changed = true;
    return { ...ws, nodes };
  });
  for (const t of theirs.values()) {
    if (t.type === "console" ? closed.has(t.id) : known.has(t.id)) continue;
    const home = daemon.workspaces.find((w) => w.nodes.some((n) => n.id === t.id))?.id;
    const target = workspaces.find((w) => w.id === home) ?? workspaces.find((w) => w.id === board.activeWorkspaceId) ?? workspaces[0];
    if (!target) continue;
    workspaces = workspaces.map((w) => (w === target ? { ...w, nodes: [...w.nodes, t] } : w));
    changed = true;
  }
  const rev = Math.max(board.rev ?? 0, daemon.rev ?? 0);
  if (!changed && rev === board.rev) return;
  const next = { ...board, workspaces, rev };
  // What the daemon holds is what the page has now synced to, so the next merge reads removals against it.
  useBoard.setState(board === loaded ? { board: next, loaded: next } : { board: next, loaded: { ...loaded, workspaces: daemon.workspaces } });
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
    <div className={node.status === "needs_you" ? "card console-card needs-you" : "card console-card"}>
      <div className="console-body">
        <ConsoleNode
          data={{ node }}
          fontSize={fontSize}
          statusBadge={
            <span className="console-meta">
              {node.worktree && <span className="chip" title={node.worktree.branch}>{node.worktree.branch}</span>}
              <StatusBadge status={node.status} />
            </span>
          }
        />
      </div>
      <div className="console-footer nodrag">
        {stopped && <button type="button" className="btn-sm" onClick={() => void resume()}>Resume</button>}
        <button type="button" className="btn-sm" aria-pressed={git} onClick={() => setGit(!git)}>Git</button>
        <button type="button" className="btn-sm" aria-label={`Close ${node.title}`} onClick={() => useBoard.getState().removeNode(node.id)}>
          Close
        </button>
        {error && <span role="alert">{error}</span>}
      </div>
      {git && (
        <div className="console-git nodrag nowheel">
          <GitCard fetch={fetch} path={node.cwd} />
          <OpenInButtons path={node.cwd} doFetch={fetch} />
        </div>
      )}
    </div>
  );
}

function NoteView(props: NodeProps) {
  const node = (props.data as { node: NoteNode }).node;
  return <div className="note">{node.text}</div>;
}

// Module-level so React Flow never remounts the nodes (and their terminals) on a render.
const nodeTypes = { console: ConsoleView, note: NoteView, webtile: WebTileView };

const focusNode = (id: string) => {
  const el = document.querySelector<HTMLElement>(`[data-testid="node-${CSS.escape(id)}"]`);
  el?.scrollIntoView?.({ block: "nearest" });
  el?.querySelector<HTMLElement>("textarea")?.focus();
};

// Stable, so effects keyed on fetch (the spawn dialog's agent list, the git card) run once.
const browserFetch: Fetch = (input, init) => globalThis.fetch(input, init);

export function App({ fetch = browserFetch, search = location.search, connect = defaultConnect }: { fetch?: Fetch; search?: string; connect?: (client: string) => SocketLike }) {
  const repo = new URLSearchParams(search).get("repo");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [settings, setSettings] = useState<Settings>({ fontSize: 13, customAgents: [] });
  const [panel, setPanel] = useState<"spawn" | "settings" | null>(null);
  const empty = useBoard((s) => !s.board.workspaces.find((w) => w.id === s.board.activeWorkspaceId)?.nodes.length);
  useNotifications({ onFocus: focusNode });
  // Escape closes the spawn modal; its backdrop keeps every terminal from seeing the key first.
  useEffect(() => {
    if (panel !== "spawn") return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [panel]);

  useEffect(() => {
    if (!repo) return;
    let live = true;
    const closed = new Set<string>();
    const cleanups: (() => void)[] = [];
    const clientId = crypto.randomUUID();
    const read = async () => {
      const res = await fetch(`/api/board?repo=${encodeURIComponent(repo)}`);
      if (res.status === 401 || res.status === 403) throw new Error("Not logged in: run `agentboard open` in the repo to get a fresh login link.");
      if (!res.ok) throw new Error(`could not load the board (${res.status})`);
      return BoardSchema.parse(await res.json());
    };
    // The daemon numbers every save; 409 means another client saved since this copy was read, so start over from theirs.
    const save = async (sent: BoardData) => {
      const res = await fetch("/api/board", { method: "PUT", headers: { "content-type": "application/json", "x-agentboard-client": clientId }, body: JSON.stringify(sent) }).catch(() => null);
      if (res?.status === 409) return void (await read().then((b) => live && useBoard.getState().setBoard(b)).catch(() => {}));
      if (!res?.ok) return;
      const { rev } = PutBoardResponseSchema.parse(await res.json());
      const { board: now } = useBoard.getState();
      const next = { ...now, rev: rev ?? now.rev };
      // Edits made while the save was in flight stay unsaved.
      useBoard.setState(now === sent ? { board: next, loaded: next } : { board: next });
    };
    (async () => {
      const board = await read();
      if (!live) return;
      useBoard.getState().setBoard(board);
      localStorage.setItem(RECENT, JSON.stringify([repo, ...readRecent().filter((r) => r !== repo)].slice(0, 10)));
      setReady(true);
      cleanups.push(
        autosaveBoard((b) => void save(b)),
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
        const s = connect(clientId);
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
  if (error) return <p role="alert" className="app-message">{error}</p>;
  if (!repo)
    return (
      <main className="picker">
        <h1>AgentBoard</h1>
        <RepoPicker recent={readRecent()} onOpen={go} />
      </main>
    );

  const saveSettings = (s: Settings) => {
    setSettings(s);
    void fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
  };
  return (
    <Api.Provider value={{ fetch, fontSize: settings.fontSize }}>
      <div className="app">
        <header className="topbar">
          <strong className="topbar-repo" title={repo}>{repo.split("/").pop()}</strong>
          {ready && <WorkspaceTabs />}
          <span className="topbar-spacer" />
          <button type="button" className="btn-primary" aria-expanded={panel === "spawn"} onClick={() => setPanel(panel === "spawn" ? null : "spawn")}>
            Spawn console
          </button>
          <button type="button" aria-expanded={panel === "settings"} onClick={() => setPanel(panel === "settings" ? null : "settings")}>
            Settings
          </button>
        </header>
        <main className="board">
          {ready ? <Board nodeTypes={nodeTypes} /> : <p className="app-message muted">Loading the board…</p>}
          {ready && empty && (
            <p className="empty-hint">
              Spawn a console or run <code>agentboard spawn</code> from any terminal
            </p>
          )}
        </main>
        <div className="rail">
          <MissionMap onFocus={focusNode} />
        </div>
        {panel === "spawn" && <div className="backdrop" onClick={() => setPanel(null)} />}
        {panel && (
          <div role="dialog" aria-label={panel === "spawn" ? "Spawn console" : "Settings"} className={panel === "spawn" ? "modal" : "drawer"}>
            <h2 className="panel-title">{panel === "spawn" ? "Spawn console" : "Settings"}</h2>
            {panel === "spawn" ? (
              <SpawnDialog
                fetch={fetch}
                cwd={repo}
                onCancel={() => setPanel(null)}
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
      </div>
    </Api.Provider>
  );
}
