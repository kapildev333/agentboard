import { startDaemon } from "./app.js";

// The `agentboard-daemon` entry: serves the board for the current directory and prints its origin.
// AGENTBOARD_PORT pins the port; startDaemon reads AGENTBOARD_AGENT_PATH itself.
try {
  const daemon = await startDaemon({
    repoPath: process.cwd(),
    port: Number(process.env.AGENTBOARD_PORT) || 0,
  });
  console.log(daemon.origin);
  const stop = () => void daemon.close().finally(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch (e) {
  console.error(`agentboard-daemon: ${(e as Error).message}`);
  process.exit(1);
}
