import type { ConsoleStatus } from "@agentboard/shared";

export const LABEL: Record<ConsoleStatus, string> = {
  stopped: "Stopped",
  starting: "Starting",
  working: "Working",
  idle: "Idle",
  needs_you: "Needs you",
  exited: "Exited",
};

// Foreground on background, every pair is at least 4.5:1 (WCAG AA); needs_you is solid and bold.
const COLORS: Record<ConsoleStatus, [fg: string, bg: string]> = {
  stopped: ["#1f2937", "#e5e7eb"],
  starting: ["#713f12", "#fef9c3"],
  working: ["#1e3a8a", "#dbeafe"],
  idle: ["#14532d", "#dcfce7"],
  needs_you: ["#ffffff", "#b91c1c"],
  exited: ["#4b5563", "#f3f4f6"],
};

export function StatusBadge({ status }: { status: ConsoleStatus }) {
  const [color, background] = COLORS[status];
  return (
    <span
      data-status={status}
      style={{
        color,
        background,
        padding: "1px 8px",
        borderRadius: 999,
        fontSize: 12,
        whiteSpace: "nowrap",
        fontWeight: status === "needs_you" ? 700 : 400,
        border: status === "needs_you" ? "1px solid #7f1d1d" : "1px solid transparent",
      }}
    >
      {LABEL[status]}
    </span>
  );
}
