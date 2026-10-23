import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { relayPath, type Launch, type LaunchInput } from "../codex/index.js";

const EVENTS = ["BeforeAgent", "AfterAgent", "Notification"];

// GEMINI_CLI_SYSTEM_DEFAULTS_PATH is the lowest-precedence settings layer, and hook arrays merge by
// concatenation, so these hooks add to the user's, project's and admin's without touching them.
export function geminiLaunch({ consoleId, daemonUrl, token, sessionId, resume }: LaunchInput): Launch {
  const dir = mkdtempSync(join(tmpdir(), "agentboard-")); // private (0700) and unguessable
  const file = join(dir, "gemini-settings.json");
  const hook = [{ hooks: [{ type: "command", command: `${JSON.stringify(process.execPath)} ${JSON.stringify(relayPath)}` }] }];
  writeFileSync(file, JSON.stringify({ hooks: Object.fromEntries(EVENTS.map((e) => [e, hook])) }), { mode: 0o600 });
  return {
    command: "gemini",
    args: resume && sessionId ? ["--resume", sessionId] : [],
    env: {
      GEMINI_CLI_SYSTEM_DEFAULTS_PATH: file,
      AGENTBOARD_URL: daemonUrl,
      AGENTBOARD_CONSOLE_ID: consoleId,
      AGENTBOARD_TOKEN: token,
      AGENTBOARD_AGENT: "gemini",
    },
  };
}
