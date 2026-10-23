import { execFile } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { AgentInfo } from "@agentboard/shared";

export interface CustomAgent {
  id: string;
  name: string;
  command: string;
  args: string[];
}

export interface ScanOptions {
  path?: string;
  exec?: typeof execFile;
  custom?: CustomAgent[];
}

const BUILTIN = ["claude", "codex", "gemini", "opencode"] as const;

function resolveCommand(command: string, path: string): string | null {
  const dirs = command.includes("/") ? [""] : path.split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    const file = join(dir, command);
    try {
      if (!statSync(file).isFile()) continue;
      accessSync(file, constants.X_OK);
      return file;
    } catch {
      // not here, try the next PATH entry
    }
  }
  return null;
}

async function scan({ path = process.env.PATH ?? "", exec = execFile, custom = [] }: ScanOptions = {}): Promise<AgentInfo[]> {
  // The timer is the hard limit: it does not depend on the child honouring a signal.
  const version = (file: string) =>
    new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);
      exec(file, ["--version"], { timeout: 3000, killSignal: "SIGKILL", env: { ...process.env, PATH: path } }, (err, stdout) => {
        clearTimeout(timer);
        resolve(err ? null : String(stdout).trim().split("\n")[0] || null);
      });
    });
  const info = async (id: AgentInfo["id"], command: string, probe: boolean): Promise<AgentInfo> => {
    const file = resolveCommand(command, path);
    return { id, command, version: file && probe ? await version(file) : null, available: file !== null };
  };
  return Promise.all([
    ...BUILTIN.map((id) => info(id, id, true)),
    // ponytail: custom agents are not probed for a version; their flags are unknown
    ...custom.map(async (c) => ({ ...(await info("custom", c.command, false)), customId: c.id, name: c.name })),
  ]);
}

export const AgentCatalog = { scan };
