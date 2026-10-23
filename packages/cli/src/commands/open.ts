import { spawn as nodeSpawn } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { ensureDaemon } from "../daemonFile.js";

export interface OpenDeps {
  spawn?: typeof nodeSpawn;
  openBrowser?: (url: string) => void;
  log?: (line: string) => void;
}

function systemOpener(spawn: typeof nodeSpawn) {
  return (url: string) => {
    const [cmd, args]: [string, string[]] =
      process.platform === "darwin" ? ["open", [url]]
      : process.platform === "win32" ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]]
      : ["xdg-open", [url]];
    const child = spawn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true });
    child.on("error", () => {}); // no opener installed: the URL is printed anyway
    child.unref();
  };
}

/** Throws before any daemon is started, so a typo never spawns one. */
export function requireDir(path: string): void {
  if (!statSync(path, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`not a directory: ${path}`);
}

export async function openCommand(args: string[], deps: OpenDeps = {}): Promise<void> {
  const spawn = deps.spawn ?? nodeSpawn;
  const log = deps.log ?? console.log;
  const openBrowser = deps.openBrowser ?? systemOpener(spawn);
  const repo = resolve(args[0] ?? ".");
  requireDir(repo);

  const info = await ensureDaemon(repo, spawn);
  // The token never goes in a URL: trade it for a one-time code.
  const res = await fetch(`http://127.0.0.1:${info.port}/auth/code`, {
    method: "POST",
    headers: { "x-agentboard-token": info.token },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`daemon refused the login code request (${res.status})`);
  const { code } = (await res.json()) as { code: string };
  const url = `http://127.0.0.1:${info.port}/?code=${encodeURIComponent(code)}&repo=${encodeURIComponent(repo)}`;
  openBrowser(url);
  log(url);
}
