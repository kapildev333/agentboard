export async function startCommand(): Promise<void> {
  // Variable specifier: the daemon is an optional seam the app fills in (L1A).
  const name = "@agentboard/daemon";
  let start: (options: { repoPath: string }) => Promise<string>;
  try {
    ({ startDaemon: start } = await import(name));
    if (typeof start !== "function") throw new Error("startDaemon is not exported");
  } catch (e) {
    console.error(`agentboard: cannot load the daemon: ${(e as Error).message.split("\n")[0]}`);
    process.exit(1);
  }
  const res = await start({ repoPath: process.cwd() });
  console.log(res);
}
