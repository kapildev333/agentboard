import { execFile } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { AgentInfo, CustomAgent } from "@agentboard/shared";

export type { CustomAgent };

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

// Versions by resolved file. Filled only when a console runs that agent (D38): the user is about to run it anyway.
const versions = new Map<string, string>();

async function readVersion(command: string, { path = process.env.PATH ?? "", exec = execFile }: ScanOptions = {}): Promise<string | null> {
  const file = resolveCommand(command, path);
  if (!file) return null;
  const known = versions.get(file);
  if (known) return known;
  // The timer is the hard limit: it does not depend on the child honouring a signal.
  const v = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000);
    exec(file, ["--version"], { timeout: 3000, killSignal: "SIGKILL", env: { ...process.env, PATH: path } }, (err, stdout) => {
      clearTimeout(timer);
      resolve(err ? null : String(stdout).trim().split("\n")[0] || null);
    });
  });
  if (v) versions.set(file, v);
  return v;
}

// Availability is PATH presence and X_OK only; scanning never runs a binary (D38: macOS shows a malware
// dialog for an unsigned CLI). A version shows once a console has run that agent.
async function scan({ path = process.env.PATH ?? "", custom = [] }: ScanOptions = {}): Promise<AgentInfo[]> {
  const info = (id: AgentInfo["id"], command: string, probe: boolean): AgentInfo => {
    const file = resolveCommand(command, path);
    return { id, command, version: file && probe ? (versions.get(file) ?? null) : null, available: file !== null };
  };
  return [
    ...BUILTIN.map((id) => info(id, id, true)),
    // ponytail: custom agents never get a version; their flags are unknown
    ...custom.map((c) => ({ ...info("custom", c.command, false), customId: c.id, name: c.name })),
  ];
}

export const AgentCatalog = { scan, readVersion, resolve: resolveCommand };
