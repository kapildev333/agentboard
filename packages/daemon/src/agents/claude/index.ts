export const CLAUDE_HOOK_EVENTS = [
  "Stop",
  "Notification",
  "UserPromptSubmit",
  "PermissionRequest",
  "SessionEnd",
] as const;

export type ClaudeLaunchOptions = {
  consoleId: string;
  sessionId: string;
  daemonUrl: string;
  token: string;
  name: string;
  resume?: boolean;
};

// Inline --settings hooks merge with the user's own hooks (docs/spikes/L04.md), so no file is written.
export function claudeLaunch(o: ClaudeLaunchOptions): { command: string; args: string[] } {
  const hook = {
    type: "http",
    url: `${o.daemonUrl}/hook/${encodeURIComponent(o.consoleId)}`,
    headers: { "X-AgentBoard-Token": o.token },
    timeout: 5,
  };
  const hooks = Object.fromEntries(CLAUDE_HOOK_EVENTS.map((e) => [e, [{ hooks: [hook] }]]));
  return {
    command: "claude",
    args: [
      o.resume ? "--resume" : "--session-id",
      o.sessionId,
      "--name",
      o.name,
      "--settings",
      JSON.stringify({ hooks }),
    ],
  };
}
