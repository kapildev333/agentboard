import "@xterm/xterm/css/xterm.css";
import { useStore } from "@xyflow/react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useConsoleSocket, type SocketFactory } from "./useConsoleSocket";

export interface ConsoleNodeProps {
  data: { consoleId: string; title?: string };
  socketFactory?: SocketFactory;
  fontSize?: number;
  statusBadge?: ReactNode;
}

/** Set as `dragHandle` on console nodes so only the header drags them. */
export const CONSOLE_DRAG_HANDLE = ".console-drag-handle";

export function ConsoleNode({ data, socketFactory, fontSize = 13, statusBadge }: ConsoleNodeProps) {
  const el = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const { sendInput, sendResize, exited } = useConsoleSocket(data.consoleId, socketFactory, (d) => term.current?.write(d));
  const io = useRef({ sendInput, sendResize });
  io.current = { sendInput, sendResize };
  const zoom = useStore((s) => s.transform[2]);
  const [focused, setFocused] = useState(false);
  const fit = useRef<FitAddon | null>(null);

  useEffect(() => {
    const t = new Terminal({ fontFamily: "Menlo, monospace", fontSize, scrollback: 5000, cursorBlink: false, allowProposedApi: false });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(el.current!);
    t.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !(e.metaKey || e.ctrlKey)) return true;
      if (e.key === "c" && t.hasSelection()) {
        void navigator.clipboard.writeText(t.getSelection());
        return false;
      }
      if (e.key === "v") {
        void navigator.clipboard.readText().then((text) => t.paste(text));
        return false;
      }
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
  }, [fontSize]);

  // One renderer (xterm's DOM) at every zoom: WebGL floors cell width, so swapping reflowed running agents.
  useEffect(() => {
    fit.current?.fit();
  }, [zoom]);

  return (
    <div
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
    >
      <header className="console-drag-handle">
        {data.title} {statusBadge}
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
