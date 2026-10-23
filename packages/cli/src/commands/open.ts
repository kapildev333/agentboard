import { spawn as nodeSpawn } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { isAlive, readDaemonInfo } from "../daemonFile.js";

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
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {}); // no opener installed: the URL is printed anyway
    child.unref();
  };
}

export async function openCommand(args: string[], deps: OpenDeps = {}): Promise<void> {
  const spawn = deps.spawn ?? nodeSpawn;
  const log = deps.log ?? console.log;
  const openBrowser = deps.openBrowser ?? systemOpener(spawn);
  const repo = resolve(args[0] ?? ".");
  if (!statSync(repo, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`not a directory: ${repo}`);

  let info = await readDaemonInfo();
  if (!info || !(await isAlive(info))) {
    const daemon = spawn(process.execPath, [process.argv[1] ?? "", "start"], { cwd: repo, stdio: "ignore", detached: true });
    daemon.on("error", () => {}); // surfaces as the timeout below
    daemon.unref();
    const deadline = Date.now() + 10_000;
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
  const url = `http://127.0.0.1:${info.port}/?token=${encodeURIComponent(info.token)}&repo=${encodeURIComponent(repo)}`;
  openBrowser(url);
  log(url);
}
