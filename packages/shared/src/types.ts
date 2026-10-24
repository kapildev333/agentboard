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
export type CustomAgent = z.infer<typeof s.CustomAgentSchema>;
export type Settings = z.infer<typeof s.SettingsSchema>;
export type OpenRequest = z.infer<typeof s.OpenRequestSchema>;
export type SnapshotConsole = z.infer<typeof s.SnapshotConsoleSchema>;
export type BoardSnapshot = z.infer<typeof s.BoardSnapshotSchema>;
export type PlanStep = z.infer<typeof s.PlanStepSchema>;
export type PlanStepKind = PlanStep["kind"];
export type Plan = z.infer<typeof s.PlanSchema>;
export type PlannedBy = z.infer<typeof s.PlannedBySchema>;
export type PlanRequest = z.infer<typeof s.PlanRequestSchema>;
export type RunRequest = z.infer<typeof s.RunRequestSchema>;
export type StepResult = z.infer<typeof s.StepResultSchema>;
export type RunResponse = z.infer<typeof s.RunResponseSchema>;
export type TranscribeResponse = z.infer<typeof s.TranscribeResponseSchema>;
export type PlannerSettings = z.infer<typeof s.PlannerSettingsSchema>;
export type VoiceSettings = z.infer<typeof s.VoiceSettingsSchema>;

// Lives in daemon code, never on the wire, so it has no schema: resume is a function.
export type AgentDef = {
  id: AgentId;
  command: string;
  args: string[];
  resume: (sessionId: string) => string[];
  signal: Signal;
};
