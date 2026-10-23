import "@xterm/xterm/css/xterm.css";
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
  const { sendInput } = useConsoleSocket(data.consoleId, socketFactory);
  const input = useRef(sendInput);
  input.current = sendInput;

  useEffect(() => {
    const term = new Terminal({ fontFamily: "Menlo, monospace", fontSize, scrollback: 5000, cursorBlink: false, allowProposedApi: false });
    term.open(el.current!);
    term.onData((d) => input.current(d));
    return () => term.dispose();
  }, [fontSize]);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <header>
        {data.title} {statusBadge}
      </header>
      <div ref={el} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}
