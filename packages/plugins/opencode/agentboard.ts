// OpenCode plugin: forwards session events to the AgentBoard daemon's hook endpoint.
import { buildHookPost, WATCHED, type OpencodeEvent } from "./hook.js";

export const AgentBoard = async () => {
  if (!buildHookPost(process.env, { type: "" })) return {};
  const send = async (event: OpencodeEvent) => {
    const post = buildHookPost(process.env, event);
    if (!post) return;
    try {
      await fetch(post.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(post.body),
      });
    } catch {
      // daemon gone: never break the agent
    }
  };
  return {
    event: async ({ event }: { event: OpencodeEvent }) => {
      if (WATCHED.has(event.type)) await send(event);
    },
    // tool.execute.before is its own hook in OpenCode, not an event-stream type
    "tool.execute.before": async (input: { tool?: string; sessionID?: string }) => {
      await send({ type: "tool.execute.before", properties: input });
    },
  };
};
