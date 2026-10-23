import type { z } from "zod";
import type * as s from "./schemas.js";

export type AgentId = z.infer<typeof s.AgentIdSchema>;
export type ConsoleStatus = z.infer<typeof s.ConsoleStatusSchema>;
export type Signal = z.infer<typeof s.SignalSchema>;
export type DaemonInfo = z.infer<typeof s.DaemonInfoSchema>;
export type Worktree = z.infer<typeof s.WorktreeSchema>;
export type ConsoleNode = z.infer<typeof s.ConsoleNodeSchema>;
export type NoteNode = z.infer<typeof s.NoteNodeSchema>;
export type WebTileNode = z.infer<typeof s.WebTileNodeSchema>;
export type ChecklistNode = z.infer<typeof s.ChecklistNodeSchema>;
export type BoardNode = z.infer<typeof s.BoardNodeSchema>;
export type Workspace = z.infer<typeof s.WorkspaceSchema>;
export type Board = z.infer<typeof s.BoardSchema>;
export type ClientMessage = z.infer<typeof s.ClientMessageSchema>;
export type DaemonMessage = z.infer<typeof s.DaemonMessageSchema>;
export type SpawnConsoleRequest = z.infer<typeof s.SpawnConsoleRequestSchema>;
export type AgentInfo = z.infer<typeof s.AgentInfoSchema>;
export type StatusResponse = z.infer<typeof s.StatusResponseSchema>;
export type HookRequest = z.infer<typeof s.HookRequestSchema>;
export type GitStatus = z.infer<typeof s.GitStatusSchema>;
export type GitDiff = z.infer<typeof s.GitDiffSchema>;

// Lives in daemon code, never on the wire, so it has no schema: resume is a function.
export type AgentDef = {
  id: AgentId;
  command: string;
  args: string[];
  resume: (sessionId: string) => string[];
  signal: Signal;
};
