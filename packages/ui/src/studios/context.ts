import { createContext } from "react";
import type { AgentId, Board, ConsoleNode } from "@agentboard/shared";

export type SpawnOptions = { agent?: AgentId; customId?: string; title?: string };
export type Studio = {
  /** The repository the page has open. */
  repo: string;
  fetch: typeof globalThis.fetch;
  consoles: ConsoleNode[];
  board: Board;
  /** Replaces the board; the autosave PUTs it (e.g. `studio.pins`). */
  saveBoard: (board: Board) => void;
  /** Types into a running console through POST /api/consoles/:id/input; nothing presses Enter for you. */
  sendInput: (consoleId: string, text: string) => Promise<void>;
  /** Starts a console in the repo with a prompt (claude unless told otherwise) and puts it on the board. */
  spawn: (prompt: string, opts?: SpawnOptions) => Promise<ConsoleNode>;
};

export const StudioContext = createContext<Studio | null>(null);
