// Pure helper, kept out of agentboard.ts: OpenCode calls every export of a plugin file as a plugin.
type Env = Record<string, string | undefined>;
export interface OpencodeEvent {
  type: string;
  properties?: unknown;
}

export const WATCHED = new Set(["session.status", "session.idle", "permission.asked", "tool.execute.before"]);

export function buildHookPost(env: Env, event: OpencodeEvent) {
  const { AGENTBOARD_URL: base, AGENTBOARD_CONSOLE_ID: id } = env;
  if (!base || !id) return null;
  return {
    url: `${base}/hook/${id}`,
    body: { agent: "opencode", event: event.type, payload: event.properties ?? {} },
  };
}
