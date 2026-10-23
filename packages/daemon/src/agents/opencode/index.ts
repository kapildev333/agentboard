import { fileURLToPath, pathToFileURL } from "node:url";
import type { Launch, LaunchInput } from "../codex/index.js";

// docs/spikes/L05.md: the plugin is loaded per launch through the config-content env var, so neither the
// user's repo nor their global config is touched. It is the one-file bundle L26 builds, loaded from the
// checkout (src/agents/opencode and dist/agents/opencode sit at the same depth), so its zod import resolves
// from the workspace's node_modules. Documented, not verified live.
export const opencodePluginPath = fileURLToPath(new URL("../../../../plugins/opencode/dist/agentboard.js", import.meta.url));

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
