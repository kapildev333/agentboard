import { spawn as nodeSpawn, type SpawnOptions } from "node:child_process";
import type { EventEmitter } from "node:events";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

export type Editor = "code" | "zed" | "finder";
export type Spawn = (command: string, args: readonly string[], options: SpawnOptions) => EventEmitter & { unref(): void };

// The command and argv for each editor. Finder on macOS reveals the folder in its parent (D23): `open` on a bundle would launch it.
const commands: Record<Editor, (platform: string, path: string) => [string, string[]]> = {
  code: (_, path) => ["code", [path]],
  zed: (_, path) => ["zed", [path]],
  finder: (platform, path) =>
    platform === "darwin" ? ["open", ["-R", path]] : platform === "win32" ? ["explorer", [path]] : ["xdg-open", [path]],
};

export async function openIn(editor: Editor, path: string, spawn: Spawn = nodeSpawn, platform = process.platform): Promise<void> {
  // Absolute only, so a path can never be read as an option; spawned as its resolved target, never as a link.
  if (!isAbsolute(path)) throw new Error(`path must be absolute: ${JSON.stringify(path)}`);
  const target = await realpath(path).catch(() => null);
  if (!target || !(await stat(target)).isDirectory()) throw new Error(`not a directory: ${JSON.stringify(path)}`);
  const [command, args] = commands[editor](platform, target);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.once("error", (err) => reject(new Error(`could not start ${command}: ${err.message}`)));
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

// The body is the POST /api/open request: { editor, path }. L12 maps a thrown Error to the HTTP response.
export async function handleOpen(body: unknown, spawn: Spawn = nodeSpawn): Promise<{ ok: true }> {
  const { editor, path } = (body ?? {}) as Record<string, unknown>;
  if (typeof editor !== "string" || !Object.hasOwn(commands, editor)) throw new Error(`unknown editor: ${String(editor)}`);
  if (typeof path !== "string") throw new Error("path must be a string");
  await openIn(editor as Editor, path, spawn);
  return { ok: true };
}
