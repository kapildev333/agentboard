import { expect, test } from "vitest";
import { mapSignal, type AgentId, type ConsoleStatus } from "@agentboard/shared";

// One row per cell of the spec's status table that arrives as an event.
const rows: [AgentId, string, unknown, ConsoleStatus | null][] = [
  ["claude", "UserPromptSubmit", undefined, "working"],
  ["claude", "PreToolUse", undefined, "working"],
  ["claude", "Stop", undefined, "idle"],
  ["claude", "Notification", { notification_type: "permission_prompt" }, "needs_you"],
  ["claude", "Notification", { notification_type: "idle_prompt" }, "needs_you"],
  ["claude", "Notification", { notification_type: "agent_needs_input" }, "needs_you"],
  ["claude", "Notification", { notification_type: "elicitation_dialog" }, "needs_you"],
  ["claude", "Notification", { notification_type: "auth_success" }, null],
  ["claude", "Notification", undefined, null],
  ["claude", "PermissionRequest", undefined, "needs_you"],
  ["claude", "SessionEnd", undefined, "exited"],
  ["claude", "SessionEnd", { reason: "logout" }, "exited"],
  ["claude", "SessionEnd", { reason: "clear" }, null],
  ["claude", "SessionEnd", { reason: "resume" }, null],
  ["opencode", "session.status", { status: { type: "busy" } }, "working"],
  ["opencode", "session.status", { status: { type: "idle" } }, null],
  ["opencode", "tool.execute.before", undefined, "working"],
  ["opencode", "session.idle", undefined, "idle"],
  ["opencode", "permission.asked", undefined, "needs_you"],
  ["codex", "agent-turn-complete", undefined, "idle"],
  ["gemini", "BeforeAgent", undefined, "working"],
  ["gemini", "AfterAgent", undefined, "idle"],
  ["gemini", "Notification", undefined, "needs_you"],
  ["claude", "BeforeAgent", undefined, null],
  ["gemini", "Stop", undefined, null],
  ["custom", "Stop", undefined, null],
  ["claude", "Nope", undefined, null],
];

test.each(rows)("mapSignal(%s, %s, %j) is %s", (agent, event, payload, want) => {
  expect(mapSignal(agent, event, payload)).toBe(want);
});
