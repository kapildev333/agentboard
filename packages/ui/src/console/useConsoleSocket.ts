import { parseClientMessage, parseDaemonMessage, type ClientMessage } from "@agentboard/shared";
import { useCallback, useEffect, useRef, useState } from "react";

export interface SocketLike {
  readyState: number;
  onopen: ((e?: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e?: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}
export type SocketFactory = () => SocketLike;

const OPEN = 1;
export const defaultSocketFactory: SocketFactory = () =>
  new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`) as unknown as SocketLike;

export function useConsoleSocket(consoleId: string, factory: SocketFactory = defaultSocketFactory, onOutput?: (data: string) => void) {
  const socket = useRef<SocketLike | null>(null);
  const make = useRef(factory);
  make.current = factory;
  const out = useRef(onOutput);
  out.current = onOutput;
  const [exit, setExit] = useState<{ code: number | null }>();
  const size = useRef<{ cols: number; rows: number } | null>(null);
  const send = useCallback((m: ClientMessage) => {
    if (socket.current?.readyState === OPEN) socket.current.send(JSON.stringify(parseClientMessage(m)));
  }, []);

  useEffect(() => {
    let disposed = false;
    const connect = (first: boolean) => {
      const s = make.current();
      socket.current = s;
      s.onopen = () => {
        // The daemon replays its ring buffer on attach, so clear the screen it already fills.
        if (!first) out.current?.("\x1bc");
        send({ t: "attach", consoleId });
        if (size.current) send({ t: "resize", consoleId, ...size.current });
      };
      s.onmessage = (e) => {
        try {
          const m = parseDaemonMessage(JSON.parse(String(e.data)));
          if (m.t === "output" && m.consoleId === consoleId) out.current?.(m.data);
          if (m.t === "exit" && m.consoleId === consoleId) setExit({ code: m.code });
        } catch {
          // not for us
        }
      };
      s.onclose = () => {
        if (!disposed && first) connect(false);
      };
    };
    connect(true);
    return () => {
      disposed = true;
      socket.current?.close();
    };
  }, [consoleId, send]);

  return {
    exited: exit !== undefined,
    exitCode: exit?.code,
    /** Forget the last exit, for a console that runs again (Resume). */
    clearExit: useCallback(() => setExit(undefined), []),
    sendResize: (cols: number, rows: number) => {
      size.current = { cols, rows };
      send({ t: "resize", consoleId, cols, rows });
    },
    sendInput: (data: string) => send({ t: "input", consoleId, data }),
  };
}
