// OpenCode plugin: forwards session events to the AgentBoard daemon and adds the agentboard_spawn tool.
import { z } from "zod";
import { buildHookPost, buildSpawnPost, WATCHED, type OpencodeEvent, type SpawnArgs } from "./hook.js";

const NOT_RUNNING = "AgentBoard is not running";

export const AgentBoard = async () => {
  const send = async (event: OpencodeEvent) => {
    const post = buildHookPost(process.env, event);
    if (!post) return;
    try {
      await fetch(post.url, {
        method: "POST",
        headers: post.headers,
        body: JSON.stringify(post.body),
        signal: AbortSignal.timeout(1000),
      });
    } catch {
      // daemon gone: never break the agent
    }
  };
  // event forwarding needs a console to report to; the tool always exists and answers "not running" itself
  const hooks = buildHookPost(process.env, { type: "" })
    ? {
        event: async ({ event }: { event: OpencodeEvent }) => {
          if (WATCHED.has(event.type)) await send(event);
        },
        // tool.execute.before is its own hook in OpenCode, not an event-stream type
        "tool.execute.before": async (input: { tool?: string; sessionID?: string }) => {
          await send({ type: "tool.execute.before", properties: input });
        },
      }
    : {};
  return {
    ...hooks,
    tool: {
      agentboard_spawn: {
        description: "Open another coding agent (claude, codex, gemini, opencode or custom) as a new console on the AgentBoard in a given directory.",
        args: {
          agent: z.enum(["claude", "codex", "gemini", "opencode", "custom"]),
          cwd: z.string().describe("Directory the new agent starts in"),
          worktree: z.string().optional().describe("Branch name for a fresh git worktree"),
          prompt: z.string().optional().describe("First message to send the new agent"),
        },
        execute: async (args: SpawnArgs) => {
          const post = buildSpawnPost(process.env, args);
          if (!post) return NOT_RUNNING;
          try {
            const res = await fetch(post.url, {
              method: "POST",
              headers: post.headers,
              body: JSON.stringify(post.body),
              signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) return NOT_RUNNING;
            const node = (await res.json()) as { id: string };
            return `Opened console ${node.id} on the AgentBoard at ${process.env.AGENTBOARD_URL}`;
          } catch {
            return NOT_RUNNING;
          }
        },
      },
    },
  };
};
