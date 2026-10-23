import "@xterm/xterm/css/xterm.css";
import { useStore } from "@xyflow/react";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, type ReactNode } from "react";
import { useConsoleSocket, type SocketFactory } from "./useConsoleSocket";

export interface ConsoleNodeProps {
  data: { consoleId: string; title?: string };
  socketFactory?: SocketFactory;
  fontSize?: number;
  statusBadge?: ReactNode;
}

export function ConsoleNode({ data, socketFactory, fontSize = 13, statusBadge }: ConsoleNodeProps) {
  const el = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const { sendInput, sendResize } = useConsoleSocket(data.consoleId, socketFactory, (d) => term.current?.write(d));
  const io = useRef({ sendInput, sendResize });
  io.current = { sendInput, sendResize };
  const zoom = useStore((s) => s.transform[2]);
  const fit = useRef<FitAddon | null>(null);
  const gl = useRef<WebglAddon | null>(null);

  useEffect(() => {
    const t = new Terminal({ fontFamily: "Menlo, monospace", fontSize, scrollback: 5000, cursorBlink: false, allowProposedApi: false });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(el.current!);
    t.onData((d) => io.current.sendInput(d));
    t.onResize(({ cols, rows }) => io.current.sendResize(cols, rows));
    term.current = t;
    fit.current = f;
    f.fit();
    const ro = new ResizeObserver(() => f.fit());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      gl.current = null;
      term.current = null;
      t.dispose();
    };
  }, [fontSize]);

  // L03: WebGL text blurs when scaled up and DOM text does not, so WebGL only at zoom <= 1.
  // ponytail: no per-node off-screen WebGL disposal (Chromium caps ~16 contexts); add when boards exceed that.
  useEffect(() => {
    const t = term.current;
    if (!t) return;
    if (zoom > 1) {
      gl.current?.dispose();
      gl.current = null;
    } else if (!gl.current) {
      try {
        const g = new WebglAddon();
        g.onContextLoss(() => {
          g.dispose();
          gl.current = null;
        });
        t.loadAddon(g);
        gl.current = g;
      } catch {
        // DOM renderer stays
      }
    }
    fit.current?.fit();
  }, [zoom, fontSize]);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <header>
        {data.title} {statusBadge}
      </header>
      <div ref={el} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}
