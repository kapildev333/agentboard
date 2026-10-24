import type * as schemas from "./schemas.js";

export type SchemaName = keyof typeof schemas;

type Route = {
  method: "GET" | "PUT" | "POST" | "DELETE";
  path: string;
  /** Query schema on GET, body schema otherwise; null when there is none. */
  request: SchemaName | null;
  response: SchemaName;
};

export const routes = [
  { method: "GET", path: "/api/board", request: "BoardQuerySchema", response: "BoardSchema" },
  { method: "PUT", path: "/api/board", request: "BoardSchema", response: "PutBoardResponseSchema" },
  { method: "POST", path: "/api/consoles", request: "SpawnConsoleRequestSchema", response: "ConsoleNodeSchema" },
  { method: "DELETE", path: "/api/consoles/:id", request: null, response: "OkSchema" },
  { method: "POST", path: "/api/consoles/:id/resume", request: null, response: "ConsoleNodeSchema" },
  { method: "GET", path: "/api/agents", request: null, response: "AgentInfoListSchema" },
  { method: "GET", path: "/api/status", request: null, response: "StatusResponseSchema" },
  { method: "POST", path: "/hook/:consoleId", request: "HookRequestSchema", response: "OkSchema" },
  { method: "GET", path: "/api/git/status", request: "GitPathQuerySchema", response: "GitStatusSchema" },
  { method: "GET", path: "/api/git/diff", request: "GitPathQuerySchema", response: "GitDiffSchema" },
  { method: "POST", path: "/api/git/worktree", request: "WorktreeRequestSchema", response: "WorktreeSchema" },
  { method: "POST", path: "/api/git/commit", request: "CommitRequestSchema", response: "CommitResponseSchema" },
  { method: "POST", path: "/api/git/push", request: "PushRequestSchema", response: "OkSchema" },
  { method: "POST", path: "/api/git/pr", request: "PrRequestSchema", response: "PrResponseSchema" },
  { method: "GET", path: "/api/settings", request: null, response: "SettingsSchema" },
  { method: "PUT", path: "/api/settings", request: "SettingsSchema", response: "OkSchema" },
  { method: "POST", path: "/api/open", request: "OpenRequestSchema", response: "OkSchema" },
  { method: "POST", path: "/api/command/plan", request: "PlanRequestSchema", response: "PlanSchema" },
  { method: "POST", path: "/api/command/run", request: "RunRequestSchema", response: "RunResponseSchema" },
  // The body is raw audio (audio/webm, audio/wav or audio/ogg), so there is no JSON request schema.
  { method: "POST", path: "/api/voice/transcribe", request: null, response: "TranscribeResponseSchema" },
  { method: "GET", path: "/api/files", request: "FilesQuerySchema", response: "FileTreeSchema" },
  { method: "GET", path: "/api/files/read", request: "FilesQuerySchema", response: "FileContentSchema" },
  { method: "PUT", path: "/api/files/write", request: "FileWriteRequestSchema", response: "OkSchema" },
  { method: "POST", path: "/api/consoles/:id/input", request: "ConsoleInputSchema", response: "OkSchema" },
  { method: "GET", path: "/api/vault/notes", request: "VaultQuerySchema", response: "VaultIndexSchema" },
  { method: "GET", path: "/api/vault/note", request: "VaultNoteQuerySchema", response: "VaultNoteSchema" },
  { method: "PUT", path: "/api/vault/note", request: "VaultWriteSchema", response: "VaultNoteSchema" },
  { method: "POST", path: "/api/vault/append", request: "VaultAppendSchema", response: "VaultNoteSchema" },
] as const satisfies readonly Route[];
