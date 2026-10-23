import { spawn as nodeSpawn, type SpawnOptions } from "node:child_process";
import type { EventEmitter } from "node:events";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

// A bad request from the client: L12 answers 400. Anything else (a failed spawn) is a 500.
export class OpenError extends Error {}

export type Editor = "code" | "zed" | "finder";
export type Spawn = (command: string, args: readonly string[], options: SpawnOptions) => EventEmitter & { unref(): void };

// The command and argv for each editor. Finder on macOS reveals the folder in its parent (D23): `open` on a bundle would launch it.
const commands: Record<Editor, (platform: string, path: string) => [string, string[]]> = {
  code: (_, path) => ["code", [path]],
  zed: (_, path) => ["zed", [path]],
  finder: (platform, path) =>
    platform === "darwin" ? ["open", ["-R", path]] : platform === "win32" ? ["explorer", [path]] : ["xdg-open", [path]],
};

// Own properties only: "constructor" or "__proto__" must not reach the command table.
function checkEditor(editor: unknown): asserts editor is Editor {
  if (typeof editor !== "string" || !Object.hasOwn(commands, editor)) throw new OpenError(`unknown editor: ${JSON.stringify(editor)}`);
}

export async function openIn(editor: Editor, path: string, spawn: Spawn = nodeSpawn, platform = process.platform): Promise<void> {
  checkEditor(editor);
  // Absolute only, so a path can never be read as an option; spawned as its resolved target, never as a link.
  if (!isAbsolute(path)) throw new OpenError(`path must be absolute: ${JSON.stringify(path)}`);
  const target = await realpath(path).catch(() => null);
  if (!target || !(await stat(target)).isDirectory()) throw new OpenError(`not a directory: ${JSON.stringify(path)}`);
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
  checkEditor(editor);
  if (typeof path !== "string") throw new OpenError("path must be a string");
  await openIn(editor, path, spawn);
  return { ok: true };
}
