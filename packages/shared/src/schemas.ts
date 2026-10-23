import { z } from "zod";

export const AgentIdSchema = z.enum(["claude", "codex", "gemini", "opencode", "custom"]);
export const ConsoleStatusSchema = z.enum(["stopped", "starting", "working", "idle", "needs_you", "exited"]);
export const SignalSchema = z.enum(["hooks", "plugin", "notify", "heuristic"]);

export const DaemonInfoSchema = z.object({ port: z.number().int(), token: z.string(), pid: z.number().int() });

const nodeBase = {
  id: z.string(),
  title: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
};

export const WorktreeSchema = z.object({ path: z.string(), branch: z.string(), base: z.string() });

export const ConsoleNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("console"),
  agent: AgentIdSchema,
  cwd: z.string(),
  worktree: WorktreeSchema.optional(),
  session: z.object({ provider: AgentIdSchema, id: z.string() }).optional(),
  status: ConsoleStatusSchema,
  createdAt: z.string(),
  lastActiveAt: z.string(),
});
export const NoteNodeSchema = z.object({ ...nodeBase, type: z.literal("note"), text: z.string() });
export const WebTileNodeSchema = z.object({ ...nodeBase, type: z.literal("webtile"), url: z.string() });
export const ChecklistNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("checklist"),
  items: z.array(z.object({ text: z.string(), done: z.boolean() })),
});
export const BoardNodeSchema = z.discriminatedUnion("type", [
  ConsoleNodeSchema,
  NoteNodeSchema,
  WebTileNodeSchema,
  ChecklistNodeSchema,
]);

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
  nodes: z.array(BoardNodeSchema),
});
export const BoardSchema = z.object({
  version: z.literal(1),
  repoPath: z.string(),
  activeWorkspaceId: z.string(),
  workspaces: z.array(WorkspaceSchema),
});

// WebSocket messages
export const ClientMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("attach"), consoleId: z.string() }),
  z.object({ t: z.literal("input"), consoleId: z.string(), data: z.string() }),
  z.object({ t: z.literal("resize"), consoleId: z.string(), cols: z.number().int().positive(), rows: z.number().int().positive() }),
]);
export const DaemonMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("output"), consoleId: z.string(), data: z.string() }),
  z.object({ t: z.literal("status"), consoleId: z.string(), status: ConsoleStatusSchema }),
  z.object({ t: z.literal("exit"), consoleId: z.string(), code: z.number().int().nullable() }),
  z.object({ t: z.literal("board"), board: BoardSchema }),
]);

// HTTP bodies, queries and responses
export const OkSchema = z.object({ ok: z.literal(true) });
export const BoardQuerySchema = z.object({ repo: z.string() });
export const SpawnConsoleRequestSchema = z.object({
  agent: AgentIdSchema,
  cwd: z.string(),
  worktree: z.string().optional(),
  prompt: z.string().optional(),
  callerConsoleId: z.string().optional(),
});
export const AgentInfoSchema = z.object({
  id: AgentIdSchema,
  command: z.string(),
  version: z.string().nullable(),
  available: z.boolean(),
});
export const AgentInfoListSchema = z.array(AgentInfoSchema);
export const StatusResponseSchema = z.object({ consoles: z.array(ConsoleNodeSchema) });
export const HookRequestSchema = z.object({ agent: AgentIdSchema, event: z.string(), payload: z.unknown().optional() });
export const GitPathQuerySchema = z.object({ path: z.string() });
export const GitStatusSchema = z.object({
  branch: z.string(),
  ahead: z.number().int(),
  behind: z.number().int(),
  dirty: z.number().int(),
  lastCommit: z.object({ sha: z.string(), subject: z.string() }).nullable(),
});
export const GitDiffSchema = z.object({
  files: z.array(z.object({ path: z.string(), status: z.string() })),
  patch: z.string(),
});
export const WorktreeRequestSchema = z.object({ repo: z.string(), name: z.string(), base: z.string() });
export const CommitRequestSchema = z.object({ path: z.string(), message: z.string() });
export const CommitResponseSchema = z.object({ sha: z.string() });
export const PushRequestSchema = z.object({ path: z.string() });
export const PrRequestSchema = z.object({ path: z.string(), title: z.string(), body: z.string().optional() });
export const PrResponseSchema = z.object({ url: z.string() });
