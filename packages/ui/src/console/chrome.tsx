import { useEffect, useState, type ReactNode } from "react";
import type { AgentId, ConsoleStatus } from "@agentboard/shared";
import { LABEL } from "../status/StatusBadge";

const LETTER: Partial<Record<AgentId, string>> = { claude: "C", codex: "X", gemini: "G", opencode: "O" };

/** The agent's monogram, styled by .mark in base.css; a custom agent shows its name's first letter. */
export function AgentMark({ agent, name }: { agent: AgentId; name: string }) {
  return (
    <span className={`mark mark-${agent}`} role="img" aria-label={agent}>
      {LETTER[agent] ?? (name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

// The --status-* colours come from .badge (app.css); console.css sizes it as the canvas's pill.
export function StatusPill({ status, code }: { status: ConsoleStatus; code?: number | null }) {
  return (
    <span className="badge console-pill" data-status={status}>
      {LABEL[status]}
      {status === "exited" && code != null && ` ${code}`}
    </span>
  );
}

export const ago = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(m / 1440)}d`;
};

/** Time since `since`, redrawn each minute. */
export function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time className="console-elapsed" dateTime={since} title={`status changed ${new Date(since).toLocaleString()}`}>
      {ago(now - Date.parse(since))}
    </time>
  );
}

const Icon = ({ size = 14, children }: { size?: number; children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
export const BranchIcon = () => (
  <Icon size={11}>
    <circle cx="5" cy="3.5" r="1.5" />
    <circle cx="5" cy="12.5" r="1.5" />
    <circle cx="11" cy="5" r="1.5" />
    <path d="M5 5v6M11 6.5c0 3-6 2-6 4.5" />
  </Icon>
);
export const MoreIcon = () => (
  <Icon>
    <path d="M3.5 8h.01M8 8h.01M12.5 8h.01" strokeWidth="2.5" />
  </Icon>
);
export const ChevronIcon = () => (
  <Icon size={12}>
    <path d="M5 6.5l3 3 3-3" />
  </Icon>
);
export const RestartIcon = () => (
  <Icon>
    <path d="M13.3 8a5.3 5.3 0 1 1-1.5-3.8M13.3 2.7v3.3H10" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </Icon>
);
