import type { AgentId } from "@agentboard/shared";

/** One CLI session, or the part of it one file holds; the report merges parts by agent and id. Times in epoch ms. */
export type Session = {
  agent: AgentId;
  id: string;
  cwd: string;
  start: number;
  end: number;
  /** Fresh input plus cache writes: everything the model read that was not a cache hit. */
  input: number;
  output: number;
  cacheRead: number;
  /** [time, input + output + cacheRead] per model reply, for token counts over a window. */
  turns: [number, number][];
};
/** null: the file is not one this CLI writes, so it is skipped and not counted. */
export type Parse = (text: string, path: string) => Session[] | null;

export const lines = (text: string): Record<string, unknown>[] =>
  text.split("\n").flatMap((l) => {
    try {
      const v = JSON.parse(l) as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? [v as Record<string, unknown>] : [];
    } catch {
      return [];
    }
  });

export const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export const time = (v: unknown): number => (typeof v === "string" || typeof v === "number" ? new Date(v).getTime() : NaN);
