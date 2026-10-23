import { spawn as nodeSpawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DaemonInfoSchema, daemonFilePath, type DaemonInfo } from "@agentboard/shared";

type Env = Record<string, string | undefined>;

/** The one daemon.json reader for the CLI and the MCP server; throws when the file is missing or malformed. */
export function loadDaemonInfo(env: Env = process.env): DaemonInfo {
  return DaemonInfoSchema.parse(JSON.parse(readFileSync(daemonFilePath(env), "utf8")));
}

export async function readDaemonInfo(env: Env = process.env): Promise<DaemonInfo | null> {
  try {
    return loadDaemonInfo(env);
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

/** Return the live daemon, spawning `agentboard start` in `cwd` and waiting for it if none answers. */
export async function ensureDaemon(cwd: string, spawn: typeof nodeSpawn = nodeSpawn, timeoutMs = 10_000): Promise<DaemonInfo> {
  const live = await readDaemonInfo();
  if (live && (await isAlive(live))) return live;
  // This package's own bin, so a caller such as the MCP server never re-runs its own script as the daemon.
  const bin = fileURLToPath(new URL("./bin.js", import.meta.url));
  const daemon = spawn(process.execPath, [bin, "start"], { cwd, stdio: "ignore", detached: true, windowsHide: true });
  let exitCode: number | null | undefined;
  daemon.on("error", () => {}); // surfaces as the timeout below
  daemon.on("exit", (code: number | null) => (exitCode = code));
  daemon.unref();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exitCode !== undefined) throw new Error(`daemon exited (${exitCode}); run agentboard start to see why`);
    const next = await readDaemonInfo();
    if (next && (await isAlive(next))) return next;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`daemon did not start within ${timeoutMs / 1000} seconds`);
}
