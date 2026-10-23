import { relayPath, type Launch } from "../codex/index.js";

export const CLAUDE_HOOK_EVENTS = [
  "Stop",
  "PreToolUse",
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
// Command hooks run notify-relay (governor ruling D15): it reads Claude's event JSON on stdin, wraps it as
// { agent, event, payload } and takes the token from the environment, so the token is never in argv.
export function claudeLaunch(o: ClaudeLaunchOptions): Launch {
  const hook = { type: "command", command: `${JSON.stringify(process.execPath)} ${JSON.stringify(relayPath)}`, timeout: 5 };
  const hooks = Object.fromEntries(CLAUDE_HOOK_EVENTS.map((e) => [e, [{ hooks: [hook] }]]));
  return {
    command: "claude",
    args: [o.resume ? "--resume" : "--session-id", o.sessionId, "--name", o.name, "--settings", JSON.stringify({ hooks })],
    env: {
      AGENTBOARD_URL: o.daemonUrl,
      AGENTBOARD_CONSOLE_ID: o.consoleId,
      AGENTBOARD_TOKEN: o.token,
      AGENTBOARD_AGENT: "claude",
    },
  };
}
