import type { ConsoleStatus } from "@agentboard/shared";

export const LABEL: Record<ConsoleStatus, string> = {
  stopped: "Stopped",
  starting: "Starting",
  working: "Working",
  idle: "Idle",
  needs_you: "Needs you",
  exited: "Exited",
};

// The .pill and .st-* rules in base.css colour it from the --status-* tokens; every pair is at least 4.5:1 (WCAG AA).
export function StatusBadge({ status }: { status: ConsoleStatus }) {
  return (
    <span className={`badge pill st-${status}`} data-status={status}>
      {LABEL[status]}
    </span>
  );
}
