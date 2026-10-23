import { useEffect, useEffectEvent } from "react";
import type { ConsoleNode } from "@agentboard/shared";
import { useBoard } from "../board";

const consoles = () =>
  useBoard.getState().board.workspaces.flatMap((w) => w.nodes.filter((n): n is ConsoleNode => n.type === "console"));

export function useNotifications({ onFocus }: { onFocus: (nodeId: string) => void }): void {
  // The latest onFocus without re-running the effect (L17: replaces a ref written during render).
  const focus = useEffectEvent((nodeId: string) => onFocus(nodeId));
  useEffect(() => {
    // Asks for notification permission once, on the first user gesture.
    let asked = false;
    const requestOnce = () => {
      if (asked || typeof Notification === "undefined") return;
      asked = true;
      void Notification.requestPermission();
    };
    const events = ["pointerdown", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, requestOnce));

    let prev = new Map(consoles().map((n) => [n.id, n.status]));
    const sync = () => {
      const now = consoles();
      const waiting = now.filter((n) => n.status === "needs_you");
      document.title = waiting.length ? `(${waiting.length}) AgentBoard` : "AgentBoard";
      if (document.hidden && typeof Notification !== "undefined") {
        for (const n of waiting) {
          if (prev.has(n.id) && prev.get(n.id) !== "needs_you") {
            // renotify is missing from lib.dom's NotificationOptions, so it goes through a variable
            const options = { body: n.agent, tag: n.id, renotify: true };
            const note = new Notification(`${n.title} needs you`, options);
            note.onclick = () => {
              window.focus(); // Chrome does not raise the tab on a notification click
              note.close();
              focus(n.id);
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
