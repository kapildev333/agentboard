import { execFile } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { AgentInfo } from "@agentboard/shared";

export interface CustomAgent {
  id: string;
  name: string;
  command: string;
  args: string[];
  needsYouRegex?: string;
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
  const version = (file: string) =>
    new Promise<string | null>((resolve) =>
      exec(file, ["--version"], { timeout: 3000 }, (err, stdout) =>
        resolve(err ? null : String(stdout).trim().split("\n")[0] || null),
      ),
    );
  const info = async (id: AgentInfo["id"], command: string, probe: boolean): Promise<AgentInfo> => {
    const file = resolveCommand(command, path);
    return { id, command, version: file && probe ? await version(file) : null, available: file !== null };
  };
  return Promise.all([
    ...BUILTIN.map((id) => info(id, id, true)),
    // ponytail: custom agents are not probed for a version; their flags are unknown
    ...custom.map((c) => info("custom", c.command, false)),
  ]);
}

export const AgentCatalog = { scan };
