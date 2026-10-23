const field = (payload, key) => typeof payload === "object" && payload !== null ? payload[key] : undefined;
const claudeNeedsYou = ["permission_prompt", "idle_prompt", "agent_needs_input", "elicitation_dialog"];
// The spec's status table, one row per signal. Output-driven cells (Codex approval
// prompts, custom regex and quiet timer) and PTY exit live in the daemon, not here.
const rows = [
    { agent: "claude", event: "UserPromptSubmit", status: "working" },
    { agent: "claude", event: "PreToolUse", status: "working" },
    { agent: "claude", event: "Stop", status: "idle" },
    {
        agent: "claude",
        event: "Notification",
        when: (p) => claudeNeedsYou.includes(field(p, "notification_type")),
        status: "needs_you",
    },
    { agent: "claude", event: "PermissionRequest", status: "needs_you" },
    { agent: "claude", event: "SessionEnd", status: "exited" },
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
export const mapSignal = (agent, event, payload) => rows.find((r) => r.agent === agent && r.event === event && (!r.when || r.when(payload)))?.status ?? null;
