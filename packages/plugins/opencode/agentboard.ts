// OpenCode plugin: forwards session events to the AgentBoard daemon's hook endpoint.
type Env = Record<string, string | undefined>;
export interface OpencodeEvent {
  type: string;
  properties?: unknown;
}

const WATCHED = new Set(["session.status", "session.idle", "permission.asked", "tool.execute.before"]);

export function buildHookPost(env: Env, event: OpencodeEvent) {
  const { AGENTBOARD_URL: base, AGENTBOARD_CONSOLE_ID: id } = env;
  if (!base || !id) return null;
  return {
    url: `${base}/hook/${id}`,
    body: { agent: "opencode", event: event.type, payload: event.properties ?? {} },
  };
}

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
