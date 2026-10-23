import { spawn as nodeSpawn, type SpawnOptions } from "node:child_process";
import type { EventEmitter } from "node:events";
import { stat } from "node:fs/promises";

export type Editor = "code" | "zed" | "finder";
export type Spawn = (command: string, args: readonly string[], options: SpawnOptions) => EventEmitter & { unref(): void };

const commands: Record<Editor, (platform: string) => string> = {
  code: () => "code",
  zed: () => "zed",
  finder: (platform) => (platform === "darwin" ? "open" : platform === "win32" ? "explorer" : "xdg-open"),
};

export async function openIn(editor: Editor, path: string, spawn: Spawn = nodeSpawn, platform = process.platform): Promise<void> {
  if (!(await stat(path).catch(() => null))?.isDirectory()) throw new Error(`not a directory: ${path}`);
  const command = commands[editor](platform);
  return new Promise((resolve, reject) => {
    const child = spawn(command, [path], { stdio: "ignore", detached: true });
    child.once("error", (err) => reject(new Error(`could not start ${command}: ${err.message}`)));
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}
