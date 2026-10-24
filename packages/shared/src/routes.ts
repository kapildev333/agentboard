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
  // The body is the raw image (png, jpeg, gif or webp), so there is no JSON request schema.
  { method: "POST", path: "/api/assets", request: null, response: "AssetUploadResponseSchema" },
  // The response is the image bytes, not JSON; BinarySchema marks that.
  { method: "GET", path: "/api/assets/:id", request: null, response: "BinarySchema" },
  { method: "GET", path: "/api/preview", request: null, response: "PreviewInfoSchema" },
  // Also served, outside /api and not in this table: GET /preview/<key>/<percent-encoded target url>,
  // the web tile preview proxy (L32). <key> comes from GET /api/preview.
  // Phase 4: orchestration and continuity
  { method: "GET", path: "/api/events", request: "EventsQuerySchema", response: "EventListSchema" },
  { method: "POST", path: "/api/handoffs", request: "HandoffDraftRequestSchema", response: "HandoffSchema" },
  { method: "PUT", path: "/api/handoffs/:id", request: "HandoffSchema", response: "HandoffSchema" },
  { method: "POST", path: "/api/handoffs/:id/send", request: null, response: "HandoffSendResponseSchema" },
  { method: "GET", path: "/api/handoffs", request: "HandoffQuerySchema", response: "HandoffListSchema" },
  { method: "GET", path: "/api/loops", request: null, response: "LoopListSchema" },
  { method: "POST", path: "/api/loops", request: "LoopRequestSchema", response: "LoopSchema" },
  { method: "PUT", path: "/api/loops/:id", request: "LoopRequestSchema", response: "LoopSchema" },
  { method: "DELETE", path: "/api/loops/:id", request: null, response: "OkSchema" },
  { method: "POST", path: "/api/loops/:id/pause", request: null, response: "LoopSchema" },
  { method: "POST", path: "/api/loops/:id/resume", request: null, response: "LoopSchema" },
  { method: "POST", path: "/api/loops/:id/run", request: null, response: "LoopSchema" },
  { method: "POST", path: "/api/composer/launch", request: "ComposerLaunchRequestSchema", response: "ComposerLaunchResponseSchema" },
  { method: "GET", path: "/api/composer/templates", request: null, response: "ComposerTemplateListSchema" },
  { method: "GET", path: "/api/usage", request: "UsageQuerySchema", response: "UsageReportSchema" },
  { method: "GET", path: "/api/usage.csv", request: "UsageQuerySchema", response: "TextSchema" },
  { method: "GET", path: "/api/memory", request: "MemoryQuerySchema", response: "MemoryItemListSchema" },
  { method: "POST", path: "/api/memory", request: "MemoryAddRequestSchema", response: "MemoryItemSchema" },
  { method: "PUT", path: "/api/memory/:id", request: "MemoryItemSchema", response: "MemoryItemSchema" },
  { method: "DELETE", path: "/api/memory/:id", request: null, response: "OkSchema" },
  { method: "POST", path: "/api/memory/:id/push", request: "MemoryPushRequestSchema", response: "MemoryPushResponseSchema" },
  { method: "POST", path: "/api/memory/propose", request: "MemoryProposeRequestSchema", response: "MemoryItemSchema" },
  { method: "GET", path: "/api/integrations", request: null, response: "IntegrationsSchema" },
] as const satisfies readonly Route[];
