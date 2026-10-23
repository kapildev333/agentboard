import { spawn as nodeSpawn } from "node:child_process";
import { resolve } from "node:path";
import { isAlive, readDaemonInfo } from "../daemonFile.js";

export interface OpenDeps {
  spawn?: typeof nodeSpawn;
  openBrowser?: (url: string) => void;
  log?: (line: string) => void;
  timeoutMs?: number;
}

function systemOpener(spawn: typeof nodeSpawn) {
  return (url: string) => {
    const [cmd, args]: [string, string[]] =
      process.platform === "darwin" ? ["open", [url]]
      : process.platform === "win32" ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]]
      : ["xdg-open", [url]];
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  };
}

export async function openCommand(args: string[], deps: OpenDeps = {}): Promise<void> {
  const spawn = deps.spawn ?? nodeSpawn;
  const log = deps.log ?? console.log;
  const openBrowser = deps.openBrowser ?? systemOpener(spawn);
  const repo = resolve(args[0] ?? ".");

  let info = await readDaemonInfo();
  if (!info || !(await isAlive(info))) {
    spawn(process.execPath, [process.argv[1] ?? "", "start"], { cwd: repo, stdio: "ignore", detached: true }).unref();
    const deadline = Date.now() + (deps.timeoutMs ?? 10_000);
    info = null;
    while (Date.now() < deadline) {
      const next = await readDaemonInfo();
      if (next && (await isAlive(next))) {
        info = next;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!info) throw new Error("daemon did not start within 10 seconds");
  }
  const url = `http://127.0.0.1:${info.port}/?token=${info.token}&repo=${encodeURIComponent(repo)}`;
  openBrowser(url);
  log(url);
}
