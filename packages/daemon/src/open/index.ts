import { spawn as nodeSpawn, type SpawnOptions } from "node:child_process";

export type Editor = "code" | "zed" | "finder";
export type Spawn = (command: string, args: readonly string[], options: SpawnOptions) => { once: Function; unref(): void };

const commands: Record<Editor, (platform: string) => string> = {
  code: () => "code",
  zed: () => "zed",
  finder: (platform) => (platform === "darwin" ? "open" : platform === "win32" ? "explorer" : "xdg-open"),
};

export function openIn(editor: Editor, path: string, spawn: Spawn = nodeSpawn, platform = process.platform): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(commands[editor](platform), [path], { stdio: "ignore", detached: true });
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}
