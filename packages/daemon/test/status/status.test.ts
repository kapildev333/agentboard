import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("every row of the status table maps through the tracker", () => {
    for (const [agent, event, payload, want] of rows) {
      const t = new StatusTracker();
      t.markStarting("c1", agent);
      expect(t.get("c1")).toBe("starting");
      t.handleHook("c1", { event, payload });
      expect(t.get("c1"), `${agent} ${event}`).toBe(want);
    }
  });

  it("the quiet timer turns a heuristic console idle after 20 seconds", () => {
    const t = new StatusTracker();
    t.markStarting("c1", "custom");
    t.markOutput("c1", "thinking");
    expect(t.get("c1")).toBe("working");
    vi.advanceTimersByTime(19_999);
    t.markOutput("c1", "more");
    vi.advanceTimersByTime(19_999);
    expect(t.get("c1")).toBe("working");
    vi.advanceTimersByTime(1);
    expect(t.get("c1")).toBe("idle");
  });

  it("hook, plugin and notify consoles ignore the quiet timer", () => {
    const t = new StatusTracker();
    const work = { claude: "PreToolUse", gemini: "BeforeAgent", opencode: "tool.execute.before", codex: "" } as const;
    for (const [a, event] of Object.entries(work) as [keyof typeof work, string][]) {
      t.markStarting(a, a);
      if (event) t.handleHook(a, { event });
      else t.markInput(a, "\r");
      t.markOutput(a, "output");
      vi.advanceTimersByTime(60_000);
      expect(t.get(a), a).toBe("working");
    }
  });

  it("a custom needs_you rule fires on matching output", () => {
    const t = new StatusTracker();
    t.markStarting("c1", "custom", { needsYou: [/\[y\/n\]/], idle: [/\$ $/] });
    t.markOutput("c1", "Proceed? [y/n] $ ");
    expect(t.get("c1")).toBe("needs_you");
    t.markOutput("c1", "ready $ ");
    expect(t.get("c1")).toBe("idle");
  });

  it("codex uses regex for needs_you and hooks for idle", () => {
    const t = new StatusTracker();
    t.markStarting("c1", "codex", { needsYou: [/Allow command\?/], idle: [/./] });
    t.markOutput("c1", "Allow command?");
    expect(t.get("c1")).toBe("needs_you");
    t.handleHook("c1", { event: "agent-turn-complete" });
    expect(t.get("c1")).toBe("idle");
    t.markOutput("c1", "anything");
    expect(t.get("c1")).toBe("idle");
  });

  it("codex output is work only after a prompt is sent", () => {
    const t = new StatusTracker();
    t.markStarting("c1", "codex");
    t.markOutput("c1", "banner");
    expect(t.get("c1")).toBe("idle");
    t.markInput("c1", "hi");
    t.markOutput("c1", "echo");
    expect(t.get("c1")).toBe("idle");
    t.markInput("c1", "\r");
    t.markOutput("c1", "thinking");
    expect(t.get("c1")).toBe("working");
    t.handleHook("c1", { event: "agent-turn-complete" });
    t.markOutput("c1", "redraw");
    expect(t.get("c1")).toBe("idle");
  });

  it("a needs_you console stays needs_you past the quiet time", () => {
    const t = new StatusTracker();
    t.markStarting("c1", "custom", { needsYou: [/\[y\/n\]/] });
    t.markOutput("c1", "working");
    t.markOutput("c1", "Proceed? [y/n]");
    vi.advanceTimersByTime(60_000);
    expect(t.get("c1")).toBe("needs_you");
  });

  it("a hook after exit does not revive the console", () => {
    const t = new StatusTracker();
    t.markStarting("c1", "opencode");
    t.markExit("c1", 0);
    t.handleHook("c1", { event: "session.idle" });
    expect(t.get("c1")).toBe("exited");
  });

  it("global regex rules match every chunk", () => {
    const t = new StatusTracker();
    t.markStarting("c1", "custom", { needsYou: [/ask/g] });
    t.markOutput("c1", "ask");
    expect(t.get("c1")).toBe("needs_you");
    t.markOutput("c1", "ask");
    expect(t.get("c1")).toBe("needs_you");
  });

  it("a restart cancels the old quiet timer", () => {
    const t = new StatusTracker();
    t.markStarting("c1", "custom");
    t.markOutput("c1", "x");
    t.markStarting("c1", "custom");
    vi.advanceTimersByTime(20_000);
    expect(t.get("c1")).toBe("starting");
  });

  it("the first output ends starting for hook agents", () => {
    const t = new StatusTracker();
    t.markStarting("c1", "claude");
    t.markOutput("c1", "welcome");
    expect(t.get("c1")).toBe("idle");
    t.handleHook("c1", { event: "PreToolUse" });
    t.markOutput("c1", "more");
    expect(t.get("c1")).toBe("working");
  });

  it("markStarting keeps the previous status and does not repeat", () => {
    const t = new StatusTracker();
    const seen: unknown[] = [];
    t.onChange((...a) => seen.push(a));
    t.markStarting("c1", "claude");
    t.markStarting("c1", "claude");
    t.markExit("c1", 0);
    t.markStarting("c1", "claude");
    expect(seen).toEqual([
      ["c1", "starting", "stopped"],
      ["c1", "exited", "starting"],
      ["c1", "starting", "exited"],
    ]);
  });

  it("a PTY exit sets exited for every agent", () => {
    const t = new StatusTracker();
    for (const a of ["claude", "codex", "gemini", "opencode", "custom"] as const) {
      t.markStarting(a, a);
      t.markExit(a, 1);
      expect(t.get(a), a).toBe("exited");
    }
  });

  it("onChange fires once per transition and not on repeats", () => {
    const t = new StatusTracker();
    const seen: unknown[] = [];
    const off = t.onChange((...a) => seen.push(a));
    t.markStarting("c1", "claude");
    t.handleHook("c1", { event: "PreToolUse" });
    t.handleHook("c1", { event: "UserPromptSubmit" });
    t.handleHook("c1", { event: "Stop" });
    expect(seen).toEqual([
      ["c1", "starting", "stopped"],
      ["c1", "working", "starting"],
      ["c1", "idle", "working"],
    ]);
    off();
    t.handleHook("c1", { event: "PreToolUse" });
    expect(seen).toHaveLength(3);
  });

  it("exit clears the timer", () => {
    const t = new StatusTracker();
    t.markStarting("c1", "custom");
    t.markOutput("c1", "x");
    t.markExit("c1", 0);
    expect(t.get("c1")).toBe("exited");
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(t.get("c1")).toBe("exited");
    t.markOutput("c1", "late");
    expect(t.get("c1")).toBe("exited");
  });
});
