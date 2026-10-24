import { useEffect, useState } from "react";
import { StatusResponseSchema, type ConsoleNode, type ConsoleStatus } from "@agentboard/shared";
import { useBoard } from "../board";
import { AgentMark } from "./AgentMark";
import { LABEL, StatusBadge } from "./StatusBadge";

const ORDER: ConsoleStatus[] = ["needs_you", "working", "idle", "starting", "stopped", "exited"];
const live = (n: ConsoleNode) => n.status !== "stopped" && n.status !== "exited";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Time since an ISO instant, short: now, 5m, 3h, 2d; empty when the instant does not parse. */
export function ago(iso: string, now: number): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (Number.isNaN(min)) return "";
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / (24 * 60))}d`;
}

type Fetch = (url: string) => Promise<Response>;

export function MissionMap({ onFocus, fetch = globalThis.fetch }: { onFocus: (nodeId: string) => void; fetch?: Fetch }) {
  const nodes = useBoard((s) => s.board.workspaces.find((w) => w.id === s.board.activeWorkspaceId)?.nodes);
  const consoles = (nodes ?? []).filter((n): n is ConsoleNode => n.type === "console");
  const running = consoles.filter(live).length;
  const [now, setNow] = useState(Date.now);
  const [ptys, setPtys] = useState<number>();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  // Every repo's consoles, so the count covers the whole daemon; refetched each minute and when this board's change.
  useEffect(() => {
    let on = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((j) => {
        const s = StatusResponseSchema.safeParse(j);
        if (on && s.success) setPtys(s.data.consoles.filter(live).length);
      })
      .catch(() => {});
    return () => void (on = false);
  }, [fetch, now, running]);
  return (
    <aside aria-label="Mission map" className="mission-map">
      <div className="mm-header">
        <h2 className="label">Mission map</h2>
        <span className="mono muted">{plural(consoles.length, "console")}</span>
      </div>
      {!consoles.length && <p className="muted mm-empty">No consoles on this workspace. Status shows here the moment one starts: working, idle or needs you.</p>}
      {ORDER.map((status) => {
        const rows = consoles.filter((n) => n.status === status);
        if (!rows.length) return null;
        return (
          <div key={status} role="group" aria-label={LABEL[status]} className="mm-group">
            <h3 className="mm-heading">
              <StatusBadge status={status} />
              <span className="mono muted">{rows.length}</span>
            </h3>
            {rows.map((n) => (
              <button key={n.id} type="button" className="mm-row" onClick={() => onFocus(n.id)}>
                {/* data-dot, not data-status: the badge is the one element per status that carries data-status */}
                <span className="dot" data-dot={status} aria-hidden="true" />
                <span className="mm-title">{n.title}</span>
                <AgentMark agent={n.agent === "custom" ? n.title : n.agent} />
                <span className="sr-only">{n.agent}</span>
                <span className="mm-ago mono muted">{ago(n.lastActiveAt, now)}</span>
              </button>
            ))}
          </div>
        );
      })}
      {ptys !== undefined && (
        <section aria-label="Daemon" className="card mm-daemon">
          <div className="mm-daemon-head">
            <h3 className="label">Daemon</h3>
            <span className="dot" data-dot="idle" aria-hidden="true" />
          </div>
          <p className="mono">{location.host}</p>
          <p className="mono muted">{plural(ptys, "PTY")}</p>
          <p className="caption">Nothing leaves this machine.</p>
        </section>
      )}
    </aside>
  );
}
