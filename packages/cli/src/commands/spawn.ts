import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { SpawnConsoleRequestSchema } from "@agentboard/shared";
import { api } from "../api.js";
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
    const json = await api(info, "POST", "/api/consoles", body);
    log(JSON.stringify(json));
    return 0;
  } catch (e) {
    log(JSON.stringify({ error: (e as Error).message }));
    return 1;
  }
}
