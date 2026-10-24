import type { AgentId } from "@agentboard/shared";

const LETTER: Partial<Record<AgentId, string>> = { claude: "C", codex: "X", gemini: "G", opencode: "O" };

/** A built-in agent's letter on its tile; anything else is a custom agent's name and shows its first letter. Decorative: the name sits beside it. */
export function AgentMark({ agent }: { agent: AgentId | (string & {}) }) {
  const builtIn = LETTER[agent as AgentId];
  return (
    <span className={`mark mark-${builtIn ? agent : "custom"}`} aria-hidden="true">
      {builtIn ?? (agent.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
