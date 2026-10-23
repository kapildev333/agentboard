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
] as const satisfies readonly Route[];
