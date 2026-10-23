import { startDaemon } from "./app.js";

// The `agentboard-daemon` entry: serves the board for the current directory and prints its origin.
// AGENTBOARD_PORT pins the port; AGENTBOARD_AGENT_PATH narrows the PATH the agent catalog scans (the e2e passes an empty one).
try {
  const daemon = await startDaemon({
    repoPath: process.cwd(),
    port: Number(process.env.AGENTBOARD_PORT) || 0,
    agentPath: process.env.AGENTBOARD_AGENT_PATH || undefined,
  });
  console.log(daemon.origin);
  const stop = () => void daemon.close().finally(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch (e) {
  console.error(`agentboard-daemon: ${(e as Error).message}`);
  process.exit(1);
}
