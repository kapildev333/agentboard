// The slice of @agentboard/daemon's startDaemon this command uses; no type import, so cli builds before daemon.
type Start = (options: { repoPath: string }) => Promise<{ origin: string; close(): Promise<void> }>;

export async function startCommand(): Promise<void> {
  // Variable specifier: node-pty loads only when a command actually starts the daemon.
  const name = "@agentboard/daemon";
  let start: Start;
  try {
    ({ startDaemon: start } = await import(name));
    if (typeof start !== "function") throw new Error("startDaemon is not exported");
  } catch (e) {
    console.error(`agentboard: cannot load the daemon: ${(e as Error).message.split("\n")[0]}`);
    process.exit(1);
  }
  const daemon = await start({ repoPath: process.cwd() });
  // The origin only: the token stays in daemon.json, and a browser logs in through `agentboard open`'s one-time code.
  console.log(daemon.origin);
  const stop = () => void daemon.close().finally(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
