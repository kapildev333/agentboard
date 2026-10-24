import "@xterm/xterm/css/xterm.css";
import "./console.css";
import { FitAddon } from "@xterm/addon-fit";
import { useReactFlow } from "@xyflow/react";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AgentId, ConsoleStatus } from "@agentboard/shared";
import { AgentMark, BranchIcon, Elapsed, StatusPill } from "./chrome";
import { CONSOLE_DRAG_HANDLE } from "./dragHandle";
import { unscaleMouse } from "./zoomMouse";
import { useConsoleSocket, type SocketFactory } from "./useConsoleSocket";

// xterm's theme keys for the 16 ANSI colours; brightBlack reads --term-ansi-bright-black.
const ANSI = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"].flatMap((c) => [c, `bright${c[0]!.toUpperCase()}${c.slice(1)}`]);

export interface ConsoleNodeProps {
  data: { node: { id: string; title: string; agent?: AgentId; status?: ConsoleStatus; lastActiveAt?: string; worktree?: { branch: string } } };
  socketFactory?: SocketFactory;
  fontSize?: number;
  /** Replaces the status pill the header draws from data.node.status. */
  statusBadge?: ReactNode;
  onExit?: (code: number | null) => void;
}

export function ConsoleNode({ data, socketFactory, fontSize = 13, statusBadge, onExit }: ConsoleNodeProps) {
  const { node } = data;
  const el = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const { sendInput, sendResize, exited, exitCode } = useConsoleSocket(node.id, socketFactory, (d) => term.current?.write(d));
  const io = useRef({ sendInput, sendResize });
  io.current = { sendInput, sendResize };
  const { getZoom } = useReactFlow();
  const zoom = useRef(getZoom);
  zoom.current = getZoom;
  const [focused, setFocused] = useState(false);
  const fit = useRef<FitAddon | null>(null);

  useEffect(() => {
    // The terminal's colours are the --term-* tokens; jsdom has none, so xterm keeps its defaults there.
    const css = getComputedStyle(el.current!);
    const token = (name: string) => css.getPropertyValue(name).trim() || undefined;
    const ansi = Object.fromEntries(ANSI.map((name) => [name, token(`--term-ansi-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`)]));
    const theme = { background: token("--term-bg"), foreground: token("--term-fg"), cursor: token("--term-fg"), selectionBackground: token("--term-selection"), ...ansi };
    const t = new Terminal({ fontFamily: token("--font-mono") ?? '"JetBrains Mono Variable", Menlo, monospace', fontSize, scrollback: 10000, cursorBlink: false, allowProposedApi: false, theme });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(el.current!);
    unscaleMouse(t, () => zoom.current());
    t.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !(/Mac/.test(navigator.userAgent) ? e.metaKey : e.ctrlKey)) return true;
      if (e.key === "c" && t.hasSelection()) return false; // browser copies the selection
      // false stops xterm only; the browser's own paste event still reaches xterm's textarea.
      if (e.key === "v") return false;
      return true;
    });
    t.onData((d) => io.current.sendInput(d));
    t.onResize(({ cols, rows }) => io.current.sendResize(cols, rows));
    term.current = t;
    fit.current = f;
    f.fit();
    // onResize does not fire when the first fit equals xterm's default 80x24.
    io.current.sendResize(t.cols, t.rows);
    const ro = new ResizeObserver(() => f.fit());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      term.current = null;
      t.dispose();
    };
  }, []);

  useEffect(() => {
    if (!term.current) return;
    term.current.options.fontSize = fontSize;
    fit.current?.fit();
  }, [fontSize]);

  const exitCb = useRef(onExit);
  exitCb.current = onExit;
  useEffect(() => {
    if (exited) exitCb.current?.(exitCode ?? null);
  }, [exited, exitCode]);

  // One renderer (xterm's DOM) at every zoom. No zoom refit: fit() measures layout pixels, which a React Flow zoom never changes.

  return (
    <div className="console">
      <header className={`${CONSOLE_DRAG_HANDLE.slice(1)} console-header`}>
        <span className="console-title" title={node.title}>
          {node.title}
        </span>{" "}
        {node.agent && <AgentMark agent={node.agent} name={node.title} />}
        {node.worktree && (
          <span className="chip console-branch" title={`branch ${node.worktree.branch}`}>
            <BranchIcon />
            {node.worktree.branch}
          </span>
        )}
        <span className="console-spacer" />
        {node.lastActiveAt && <Elapsed since={node.lastActiveAt} />}
        {statusBadge ?? (node.status && <StatusPill status={node.status} code={exitCode} />)}
      </header>
      <div
        ref={el}
        className={focused ? "console-term nodrag nowheel" : "console-term"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {exited && (
        <span role="status" className="visually-hidden">
          {node.title} exited{exitCode != null && ` with code ${exitCode}`}
        </span>
      )}
    </div>
  );
}
