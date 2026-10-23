import type { AgentId, ConsoleNode } from "@agentboard/shared";

const field = (v: unknown, key: string): unknown =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>)[key] : undefined;
const text = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

// D34: a nested `claude -p` inherits AGENTBOARD_CONSOLE_ID, so its posts carry another session_id and must not count.
export function acceptHook(node: Pick<ConsoleNode, "session">, payload: unknown): boolean {
  const id = text(field(payload, "session_id"));
  return !id || !node.session || node.session.id === id;
}

// The id each agent's resume needs, where the agent picks it (L14): claude's is chosen at spawn, custom agents have none.
export function sessionFromHook(agent: AgentId, event: string, payload: unknown): string | undefined {
  switch (agent) {
    case "codex":
      return text(field(payload, "thread-id"));
    case "gemini":
      return text(field(payload, "session_id"));
    case "opencode":
      return event === "session.created" ? text(field(field(payload, "info"), "id")) : undefined;
    default:
      return undefined;
  }
}

// D39: Claude keeps running after SessionEnd on /clear and /resume but continues under a new session id,
// so the next id the console sees is adopted once; without it D34 would drop every later hook.
export function adoptsNextSession(event: string, payload: unknown): boolean {
  return event === "SessionEnd" && ["clear", "resume"].includes(field(payload, "reason") as string);
}

export const sessionIdOf = (payload: unknown): string | undefined => text(field(payload, "session_id"));
