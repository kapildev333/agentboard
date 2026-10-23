import { describe, expect, it } from "vitest";
import type { AgentId, ConsoleStatus } from "@agentboard/shared";
import { StatusTracker } from "../../src/status/index.js";

const rows: [AgentId, string, unknown, ConsoleStatus][] = [
  ["claude", "UserPromptSubmit", undefined, "working"],
  ["claude", "PreToolUse", undefined, "working"],
  ["claude", "Stop", undefined, "idle"],
  ["claude", "Notification", { notification_type: "permission_prompt" }, "needs_you"],
  ["claude", "Notification", { notification_type: "idle_prompt" }, "needs_you"],
  ["claude", "Notification", { notification_type: "agent_needs_input" }, "needs_you"],
  ["claude", "Notification", { notification_type: "elicitation_dialog" }, "needs_you"],
  ["claude", "PermissionRequest", undefined, "needs_you"],
  ["claude", "SessionEnd", undefined, "exited"],
  ["opencode", "session.status", { status: { type: "busy" } }, "working"],
  ["opencode", "tool.execute.before", undefined, "working"],
  ["opencode", "session.idle", undefined, "idle"],
  ["opencode", "permission.asked", undefined, "needs_you"],
  ["codex", "agent-turn-complete", undefined, "idle"],
  ["gemini", "BeforeAgent", undefined, "working"],
  ["gemini", "AfterAgent", undefined, "idle"],
  ["gemini", "Notification", undefined, "needs_you"],
];

describe("StatusTracker", () => {
  it("every row of the status table maps through the tracker", () => {
    for (const [agent, event, payload, want] of rows) {
      const t = new StatusTracker();
      t.markStarting("c1", agent);
      expect(t.get("c1")).toBe("starting");
      t.handleHook("c1", { event, payload });
      expect(t.get("c1"), `${agent} ${event}`).toBe(want);
    }
  });
});
