import { isAlive, readDaemonInfo } from "../daemonFile.js";

export async function statusCommand(log: (line: string) => void = console.log): Promise<number> {
  const info = await readDaemonInfo();
  if (info && (await isAlive(info))) {
    log(JSON.stringify({ alive: true, port: info.port, pid: info.pid }));
    return 0;
  }
  log(JSON.stringify({ alive: false }));
  return 1;
}
