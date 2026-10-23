import { useEffect, useRef } from "react";
import type { ConsoleNode } from "@agentboard/shared";
import { useBoard } from "../board";

let asked = false;
/** Asks for notification permission once, on the first user gesture. */
export function requestOnce(): void {
  if (asked || typeof Notification === "undefined" || Notification.permission !== "default") return;
  asked = true;
  void Notification.requestPermission();
}

const consoles = () =>
  useBoard.getState().board.workspaces.flatMap((w) => w.nodes.filter((n): n is ConsoleNode => n.type === "console"));

export function useNotifications({ onFocus }: { onFocus: (nodeId: string) => void }): void {
  const focus = useRef(onFocus);
  focus.current = onFocus;
  useEffect(() => {
    const events = ["pointerdown", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, requestOnce, { once: true }));

    let prev = new Map(consoles().map((n) => [n.id, n.status]));
    const sync = () => {
      const now = consoles();
      const waiting = now.filter((n) => n.status === "needs_you");
      document.title = waiting.length ? `(${waiting.length}) AgentBoard` : "AgentBoard";
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const n of waiting) {
          if (prev.has(n.id) && prev.get(n.id) !== "needs_you") {
            const note = new Notification(`${n.title} needs you`, { body: n.agent, tag: n.id });
            note.onclick = () => {
              window.focus(); // Chrome does not raise the tab on a notification click
              note.close();
              focus.current(n.id);
            };
          }
        }
      }
      prev = new Map(now.map((n) => [n.id, n.status]));
    };
    const unsub = useBoard.subscribe(sync);
    sync();
    return () => {
      unsub();
      document.title = "AgentBoard";
      events.forEach((e) => window.removeEventListener(e, requestOnce));
    };
  }, []);
}
