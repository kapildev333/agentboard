import { fileURLToPath } from "node:url";

export interface LaunchInput {
  consoleId: string;
  daemonUrl: string;
  token: string;
  sessionId?: string;
  resume?: boolean;
}

export interface Launch {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export const relayPath = fileURLToPath(new URL("../notify-relay.js", import.meta.url));

// Codex appends the notify JSON as the last argv entry; `-c` overrides config.toml for this launch only.
export function codexLaunch({ consoleId, daemonUrl, token, sessionId, resume }: LaunchInput): Launch {
  const notify = `notify=${JSON.stringify(["node", relayPath])}`;
  return {
    command: "codex",
    args: [...(resume && sessionId ? ["resume", sessionId] : []), "-c", notify],
    env: { AGENTBOARD_URL: daemonUrl, AGENTBOARD_CONSOLE_ID: consoleId, AGENTBOARD_TOKEN: token },
  };
}
