import { parseArgs } from "node:util";
import { StatusResponseSchema } from "@agentboard/shared";
import { api } from "../api.js";
import { isAlive, readDaemonInfo } from "../daemonFile.js";

export async function statusCommand(args: string[] = [], log: (line: string) => void = console.log): Promise<number> {
  const { values } = parseArgs({ args, options: { json: { type: "boolean" } } });
  const info = await readDaemonInfo();
  if (info && (await isAlive(info))) {
    const consoles = values.json
      ? StatusResponseSchema.parse(await api(info, "GET", "/api/status")).consoles.map(({ id, title, agent, status }) => ({ id, title, agent, status }))
      : undefined;
    log(JSON.stringify({ alive: true, port: info.port, pid: info.pid, ...(consoles && { consoles }) }));
    return 0;
  }
  log(JSON.stringify({ alive: false }));
  return 1;
}
