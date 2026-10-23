import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { SpawnConsoleRequestSchema } from "@agentboard/shared";
import { ensureDaemon } from "../daemonFile.js";

export async function spawnCommand(args: string[], deps: { log?: (line: string) => void } = {}): Promise<number> {
  const log = deps.log ?? console.log;
  try {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: { worktree: { type: "string" }, prompt: { type: "string" }, repo: { type: "string" } },
    });
    const body = SpawnConsoleRequestSchema.parse({
      agent: positionals[0],
      cwd: resolve(values.repo ?? process.cwd()),
      worktree: values.worktree,
      prompt: values.prompt,
      callerConsoleId: process.env.AGENTBOARD_CONSOLE_ID,
    });
    const info = await ensureDaemon(body.cwd);
    const res = await fetch(`http://127.0.0.1:${info.port}/api/consoles`, {
      method: "POST",
      headers: { "x-agentboard-token": info.token, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? `daemon answered ${res.status}`);
    log(JSON.stringify(json));
    return 0;
  } catch (e) {
    log(JSON.stringify({ error: (e as Error).message }));
    return 1;
  }
}
