import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { relayPath, type Launch, type LaunchInput } from "../codex/index.js";

const EVENTS = ["BeforeAgent", "AfterAgent", "Notification"];

// GEMINI_CLI_SYSTEM_SETTINGS_PATH swaps the system-level settings file for this process only,
// so hooks apply to this launch without touching ~/.gemini or the repo's .gemini/settings.json.
export function geminiLaunch({ consoleId, daemonUrl, token, sessionId, resume }: LaunchInput): Launch {
  const dir = join(tmpdir(), "agentboard", consoleId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, "gemini-settings.json");
  const hook = [{ hooks: [{ type: "command", command: `node ${JSON.stringify(relayPath)}` }] }];
  writeFileSync(file, JSON.stringify({ hooks: Object.fromEntries(EVENTS.map((e) => [e, hook])) }), { mode: 0o600 });
  return {
    command: "gemini",
    args: resume && sessionId ? ["--resume", sessionId] : [],
    env: {
      GEMINI_CLI_SYSTEM_SETTINGS_PATH: file,
      AGENTBOARD_URL: daemonUrl,
      AGENTBOARD_CONSOLE_ID: consoleId,
      AGENTBOARD_TOKEN: token,
    },
  };
}
