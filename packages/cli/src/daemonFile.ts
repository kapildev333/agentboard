import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DaemonInfoSchema, type DaemonInfo } from "@agentboard/shared";

export async function readDaemonInfo(): Promise<DaemonInfo | null> {
  const file = join(process.env.AGENTBOARD_HOME ?? join(homedir(), ".agentboard"), "daemon.json");
  try {
    return DaemonInfoSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return null;
  }
}

export async function isAlive(info: DaemonInfo): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${info.port}/api/status`, {
      headers: { "x-agentboard-token": info.token },
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
