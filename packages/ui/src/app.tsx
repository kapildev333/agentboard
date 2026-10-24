import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { BoardSchema, GitStatusSchema, PutBoardResponseSchema, SettingsSchema, parseDaemonMessage, type Board as BoardData, type BoardNode, type ConsoleNode as ConsoleData, type NoteNode, type Settings } from "@agentboard/shared";
import { version } from "../package.json";
import { Board, EmptyBoard, FolderIcon, Logo, SettingsIcon, WorkspaceTabs, ZoomLevel, addNoteAtCentre, autosaveBoard, mod, typing, useBoard } from "./board";
import { CommandBar } from "./command";
import { ConsoleNode, type SocketLike } from "./console";
import { GitCard } from "./git";
import { OpenInButtons } from "./open/OpenInButtons";
import { RepoPicker, SettingsPanel, SpawnDialog, type RecentRepo } from "./shell";
import { MissionMap, StatusBadge, useNotifications } from "./status";
import { WebTileView } from "./webtile";

type Fetch = typeof globalThis.fetch;
const Api = createContext<{ fetch: Fetch; fontSize: number }>({ fetch: globalThis.fetch, fontSize: 13 });

const RECENT = "agentboard.recent";
const consoles = (b: BoardData) => b.workspaces.flatMap((w) => w.nodes).filter((n): n is ConsoleData => n.type === "console");
const readRecent = (): RecentRepo[] => {
  try {
    return (JSON.parse(localStorage.getItem(RECENT) ?? "[]") as (string | RecentRepo)[]).map((r) => (typeof r === "string" ? { path: r } : r));
  } catch {
    return [];
  }
};
/** Puts a repo first in the launch page's recent list, with its console count. */
const remember = (path: string, n: number) =>
  localStorage.setItem(RECENT, JSON.stringify([{ path, consoles: n }, ...readRecent().filter((r) => r.path !== path)].slice(0, 10)));
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
  const [panel, setPanelState] = useState<"spawn" | "settings" | "command" | null>(null);
  const flow = useRef<{ fitView: () => unknown }>(undefined);
  // Focus goes back to whatever opened a panel when it closes.
  const opener = useRef<HTMLElement | null>(null);
  const setPanel = (p: typeof panel) => {
    if (p && !panel) opener.current = document.activeElement as HTMLElement | null;
    setPanelState(p);
    if (!p) opener.current?.focus();
  };
  const empty = useBoard((s) => !s.board.workspaces.find((w) => w.id === s.board.activeWorkspaceId)?.nodes.length);
  useNotifications({ onFocus: focusNode });
  // Escape closes the spawn modal (its backdrop keeps every terminal from seeing the key first) and the settings
  // drawer, unless the key went to a terminal, which may want it. The command bar handles its own.
  useEffect(() => {
    if (panel !== "spawn" && panel !== "settings") return;
    const close = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (panel === "settings" && e.target instanceof Element && e.target.closest(".xterm"))) return;
      setPanelState(null);
      opener.current?.focus();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [panel]);

  // ⌘K / Ctrl+K opens the command bar; capture phase, so a focused terminal never sees it.
  useEffect(() => {
    const open = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      setPanelState((p) => (p === "command" ? null : "command"));
    };
    window.addEventListener("keydown", open, true);
    return () => window.removeEventListener("keydown", open, true);
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/settings")
      .then(async (r) => r.ok && live && setSettings(SettingsSchema.parse(await r.json())))
      .catch(() => {});
    return () => void (live = false);
  }, [fetch]);

  // The repo's branch for the top bar chip; no chip while it is unknown (or the folder is not a git repo).
  const [branch, setBranch] = useState<string>();
  useEffect(() => {
    if (!repo) return;
    let live = true;
    fetch(`/api/git/status?path=${encodeURIComponent(repo)}`)
      .then((r) => r.json())
      .then((j) => {
        const s = GitStatusSchema.safeParse(j);
        if (live && s.success) setBranch(s.data.branch);
      })
      .catch(() => {});
    return () => void (live = false);
  }, [repo, fetch]);

  // ⌘⇧N spawns a console; N adds a note unless a terminal or a field has the key.
  useEffect(() => {
    if (!repo || !ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.altKey) return;
      if (mod(e) && e.shiftKey) {
        e.preventDefault();
        opener.current = document.activeElement as HTMLElement | null;
        setPanelState("spawn");
      } else if (!mod(e) && !e.shiftKey && !typing(e.target)) {
        e.preventDefault();
        addNoteAtCentre();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [repo, ready]);

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
      remember(repo, consoles(board).length);
      setReady(true);
      cleanups.push(
        autosaveBoard((b) => void save(b)),
        // A console that leaves the board (Close, delete key, workspace delete) is ended by the daemon.
        useBoard.subscribe((s, prev) => {
          if (s.board === prev.board || s.board.repoPath !== prev.board.repoPath) return;
          const now = new Set(consoles(s.board).map((n) => n.id));
          if (now.size !== consoles(prev.board).length) remember(repo, now.size);
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
    })().catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
      cleanups.forEach((f) => f());
    };
  }, [repo, fetch, connect]);

  const go = (path: string) => (location.search = `?repo=${encodeURIComponent(path)}`);
  if (error) return <p role="alert" className="app-message">{error}</p>;

  const saveSettings = (s: Settings) => {
    setSettings(s);
    void fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
  };
  const brand = (
    <span className="brand">
      <Logo />
      <strong>AgentBoard</strong>
    </span>
  );
  const settingsButton = (
    <button type="button" className="btn-icon" aria-label="Settings" aria-expanded={panel === "settings"} onClick={() => setPanel(panel === "settings" ? null : "settings")}>
      <SettingsIcon />
    </button>
  );
  const settingsDrawer = panel === "settings" && (
    <div role="dialog" aria-label="Settings" className="drawer">
      <h2 className="panel-title">Settings</h2>
      <SettingsPanel settings={settings} onChange={saveSettings} />
    </div>
  );
  if (!repo)
    return (
      <div className="launch">
        <header className="topbar">
          {brand}
          <span className="chip">v{version}</span>
          <span className="topbar-spacer" />
          <span className="mono muted topbar-daemon">
            <span className="dot" data-dot="idle" aria-hidden="true" />
            daemon {location.host}
          </span>
          {settingsButton}
        </header>
        <main className="launch-body">
          <RepoPicker recent={readRecent()} onOpen={go} onAddAgent={() => setPanel("settings")} fetch={fetch} />
        </main>
        {settingsDrawer}
      </div>
    );

  return (
    <Api.Provider value={{ fetch, fontSize: settings.fontSize }}>
      <div className="app">
        <header className="topbar">
          {brand}
          <span className="topbar-divider" aria-hidden="true" />
          <span className="topbar-repo" title={repo}>
            <FolderIcon />
            <strong>{repo.replace(/\/+$/, "").split("/").pop()}</strong>
            {branch && <span className="chip" title={branch}>{branch}</span>}
          </span>
          {ready && <WorkspaceTabs />}
          <span className="topbar-spacer" />
          {ready && <ZoomLevel />}
          <button type="button" className="btn-primary" aria-expanded={panel === "spawn"} onClick={() => setPanel(panel === "spawn" ? null : "spawn")}>
            Spawn console
          </button>
          <button type="button" aria-label="Command" aria-keyshortcuts="Meta+K Control+K" aria-expanded={panel === "command"} onClick={() => setPanel(panel === "command" ? null : "command")}>
            Command <kbd>⌘K</kbd>
          </button>
          {settingsButton}
        </header>
        <main className="board">
          {ready ? <Board nodeTypes={nodeTypes} onInit={(rf) => (flow.current = rf)} /> : <p className="app-message muted">Loading the board…</p>}
          {ready && empty && <EmptyBoard onSpawn={() => setPanel("spawn")} />}
        </main>
        <div className="rail">
          <MissionMap onFocus={focusNode} fetch={fetch} />
        </div>
        {/* setPanelState, not setPanel: the bar may have just focused a console, which keeps the focus */}
        <CommandBar open={panel === "command"} onClose={() => setPanelState(null)} fetch={fetch} repo={repo} onFocus={focusNode} onFit={() => void flow.current?.fitView()} />
        {panel === "spawn" && (
          <>
            <div className="backdrop" onClick={() => setPanel(null)} />
            <div role="dialog" aria-label="Spawn console" className="modal">
              <h2 className="panel-title">Spawn console</h2>
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
            </div>
          </>
        )}
        {settingsDrawer}
      </div>
    </Api.Provider>
  );
}
