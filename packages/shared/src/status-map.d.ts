import type { AgentId, ConsoleStatus } from "./types.js";
export declare const mapSignal: (agent: AgentId, event: string, payload?: unknown) => ConsoleStatus | null;
