import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// `env -0` output: NUL-separated NAME=value entries. Entries without a usable name (shell noise) are skipped.
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of text.split("\0")) {
    const i = entry.indexOf("=");
    if (i > 0 && !entry.slice(0, i).includes("\n")) out[entry.slice(0, i)] = entry.slice(i + 1);
  }
  return out;
}

let cached: Promise<Record<string, string>> | undefined;

// The login shell's variables, read once per process; falls back to process.env if the shell fails.
// `-ilc` works in bash, zsh and fish alike.
export function loginEnv(): Promise<Record<string, string>> {
  return (cached ??= read());
}

async function read(): Promise<Record<string, string>> {
  try {
    const { stdout } = await run(process.env.SHELL || "/bin/sh", ["-ilc", "env -0"], { timeout: 10_000, maxBuffer: 4 << 20 });
    const parsed = parseEnv(stdout);
    if (parsed.PATH) return parsed;
  } catch {
    // fall through to process.env
  }
  return Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
}
