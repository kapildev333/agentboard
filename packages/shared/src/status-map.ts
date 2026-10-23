import type { AgentId, ConsoleStatus } from "./types.js";

type Row = { agent: AgentId; event: string; when?: (payload: unknown) => boolean; status: ConsoleStatus };

const field = (payload: unknown, key: string): unknown =>
  typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>)[key] : undefined;

const claudeNeedsYou = ["permission_prompt", "idle_prompt", "agent_needs_input", "elicitation_dialog"];

// The spec's status table, one row per signal. Output-driven cells (Codex approval
// prompts, custom regex and quiet timer) and PTY exit live in the daemon, not here.
const rows: Row[] = [
  { agent: "claude", event: "UserPromptSubmit", status: "working" },
  { agent: "claude", event: "PreToolUse", status: "working" },
  { agent: "claude", event: "Stop", status: "idle" },
  {
    agent: "claude",
    event: "Notification",
    when: (p) => claudeNeedsYou.includes(field(p, "notification_type") as string),
    status: "needs_you",
  },
  { agent: "claude", event: "PermissionRequest", status: "needs_you" },
  // Claude Code keeps running after SessionEnd on /clear and /resume
  { agent: "claude", event: "SessionEnd", when: (p) => !["clear", "resume"].includes(field(p, "reason") as string), status: "exited" },
  // payload is the OpenCode event's properties: { sessionID, status: { type } }
  { agent: "opencode", event: "session.status", when: (p) => field(field(p, "status"), "type") === "busy", status: "working" },
  { agent: "opencode", event: "tool.execute.before", status: "working" },
  { agent: "opencode", event: "session.idle", status: "idle" },
  { agent: "opencode", event: "permission.asked", status: "needs_you" },
  { agent: "codex", event: "agent-turn-complete", status: "idle" },
  { agent: "gemini", event: "BeforeAgent", status: "working" },
  { agent: "gemini", event: "AfterAgent", status: "idle" },
  { agent: "gemini", event: "Notification", status: "needs_you" },
];

export const mapSignal = (agent: AgentId, event: string, payload?: unknown): ConsoleStatus | null =>
  rows.find((r) => r.agent === agent && r.event === event && (!r.when || r.when(payload)))?.status ?? null;
