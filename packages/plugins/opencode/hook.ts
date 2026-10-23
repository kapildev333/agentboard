// Pure helpers, kept out of agentboard.ts: OpenCode calls every export of a plugin file as a plugin.
// Shapes mirror HookRequestSchema and SpawnConsoleRequestSchema in @agentboard/shared (not imported: the plugin ships standalone).
type Env = Record<string, string | undefined>;
export interface OpencodeEvent {
  type: string;
  properties?: unknown;
}
export interface SpawnArgs {
  agent: "claude" | "codex" | "gemini" | "opencode" | "custom";
  cwd: string;
  worktree?: string;
  prompt?: string;
}

export const WATCHED = new Set(["session.created", "session.status", "session.idle", "permission.asked"]);

const headers = (env: Env) => ({ "content-type": "application/json", "X-AgentBoard-Token": env.AGENTBOARD_TOKEN ?? "" });

export function buildHookPost(env: Env, event: OpencodeEvent) {
  const { AGENTBOARD_URL: base, AGENTBOARD_CONSOLE_ID: id } = env;
  if (!base || !id) return null;
  return {
    url: `${base}/hook/${id}`,
    headers: headers(env),
    body: { agent: "opencode", event: event.type, payload: event.properties ?? {} },
  };
}

export function buildSpawnPost(env: Env, args: SpawnArgs) {
  const { AGENTBOARD_URL: base, AGENTBOARD_CONSOLE_ID: caller } = env;
  if (!base) return null;
  return {
    url: `${base}/api/consoles`,
    headers: headers(env),
    body: { ...args, ...(caller && { callerConsoleId: caller }) },
  };
}
