import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// Lines of `KEY=value`; a line that does not start a new key continues the previous value.
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let key: string | undefined;
  for (const line of text.split("\n")) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) out[(key = m[1]!)] = m[2]!;
    else if (key) out[key] += `\n${line}`;
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
    const { stdout } = await run(process.env.SHELL || "/bin/sh", ["-ilc", "env"], { timeout: 10_000, maxBuffer: 4 << 20 });
    const parsed = parseEnv(stdout);
    if (parsed.PATH) return parsed;
  } catch {
    // fall through to process.env
  }
  return Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
}
