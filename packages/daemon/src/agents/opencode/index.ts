import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Launch, LaunchInput } from "../codex/index.js";

// docs/spikes/L05.md: the plugin lives at a stable path and is loaded per launch through the config-content
// env var, so neither the user's repo nor their global config is touched. Documented, not verified live.
export const opencodePluginPath = join(homedir(), ".agentboard", "plugins", "opencode", "agentboard.ts");

export function opencodeLaunch({ consoleId, daemonUrl, token, sessionId, resume }: LaunchInput): Launch {
  return {
    command: "opencode",
    args: resume && sessionId ? ["--session", sessionId] : [],
    env: {
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugin: [pathToFileURL(opencodePluginPath).href] }),
      AGENTBOARD_URL: daemonUrl,
      AGENTBOARD_CONSOLE_ID: consoleId,
      AGENTBOARD_TOKEN: token,
      AGENTBOARD_AGENT: "opencode",
    },
  };
}
