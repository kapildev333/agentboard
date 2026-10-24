import type { ConsoleStatus } from "@agentboard/shared";

export const LABEL: Record<ConsoleStatus, string> = {
  stopped: "Stopped",
  starting: "Starting",
  working: "Working",
  idle: "Idle",
  needs_you: "Needs you",
  exited: "Exited",
};

// Colours come from the --status-* tokens keyed on data-status (app.css); every pair is at least 4.5:1 (WCAG AA).
export function StatusBadge({ status }: { status: ConsoleStatus }) {
  return (
    <span className="badge" data-status={status}>
      {LABEL[status]}
    </span>
  );
}
