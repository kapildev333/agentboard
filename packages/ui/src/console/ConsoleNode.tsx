import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CONSOLE_DRAG_HANDLE } from "./dragHandle";
import { useConsoleSocket, type SocketFactory } from "./useConsoleSocket";

export interface ConsoleNodeProps {
  data: { node: { id: string; title: string } };
  socketFactory?: SocketFactory;
  fontSize?: number;
  statusBadge?: ReactNode;
}

export function ConsoleNode({ data, socketFactory, fontSize = 13, statusBadge }: ConsoleNodeProps) {
  const el = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const { sendInput, sendResize, exited } = useConsoleSocket(data.node.id, socketFactory, (d) => term.current?.write(d));
  const io = useRef({ sendInput, sendResize });
  io.current = { sendInput, sendResize };
  const [focused, setFocused] = useState(false);
  const fit = useRef<FitAddon | null>(null);

  useEffect(() => {
    const t = new Terminal({ fontFamily: "Menlo, monospace", fontSize, scrollback: 5000, cursorBlink: false, allowProposedApi: false });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(el.current!);
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

  // One renderer (xterm's DOM) at every zoom. No zoom refit: fit() measures layout pixels, which a React Flow zoom never changes.

  return (
    <div
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
    >
      <header className={CONSOLE_DRAG_HANDLE.slice(1)}>
        {data.node.title} {statusBadge}
      </header>
      <div
        ref={el}
        className={focused ? "nodrag nowheel" : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ flex: 1, minHeight: 0 }} />
      {exited && <footer>[exited]</footer>}
    </div>
  );
}
