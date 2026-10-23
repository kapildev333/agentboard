import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { AgentIdSchema, SpawnConsoleRequestSchema } from "@agentboard/shared";
import { api } from "../api.js";
import { ensureDaemon } from "../daemonFile.js";
import { requireDir } from "./open.js";

export async function spawnCommand(args: string[], deps: { log?: (line: string) => void } = {}): Promise<number> {
  const log = deps.log ?? console.log;
  try {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: { worktree: { type: "string" }, prompt: { type: "string" }, repo: { type: "string" }, id: { type: "string" } },
    });
    if (positionals.length !== 1) throw new Error("usage: agentboard spawn <agent> [--worktree <name>] [--prompt <text>] [--repo <path>] [--id <customId>]");
    const agent = positionals[0]!;
    if (!AgentIdSchema.safeParse(agent).success) throw new Error(`unknown agent: ${agent} (${AgentIdSchema.options.join("|")})`);
    if (agent === "custom" && !values.id) throw new Error("custom agents need --id <id>; the ids are the custom agents in the board settings (GET /api/agents lists them)");
    const body = SpawnConsoleRequestSchema.parse({
      agent,
      customId: values.id,
      cwd: resolve(values.repo ?? process.cwd()),
      worktree: values.worktree,
      prompt: values.prompt,
      callerConsoleId: process.env.AGENTBOARD_CONSOLE_ID || undefined,
    });
    requireDir(body.cwd);
    const info = await ensureDaemon(body.cwd);
    const json = await api(info, "POST", "/api/consoles", body);
    log(JSON.stringify(json));
    return 0;
  } catch (e) {
    log(JSON.stringify({ error: (e as Error).message }));
    return 1;
  }
}
