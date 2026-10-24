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
  /** Which custom agent from settings a custom console runs, so it can start again after a restart. */
  customId: z.string().optional(),
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
  /** Counts the saves of PUT /api/board; a PUT older than the saved one is refused (409), one without a rev is not checked. Optional so a board file from before it existed still loads. */
  rev: z.number().int().nonnegative().optional(),
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
export const PutBoardResponseSchema = z.object({ ok: z.literal(true), rev: z.number().int().nonnegative().optional() });
export const BoardQuerySchema = z.object({ repo: z.string() });
export const SpawnConsoleRequestSchema = z.object({
  agent: AgentIdSchema,
  cwd: z.string(),
  worktree: z.string().optional(),
  prompt: z.string().optional(),
  callerConsoleId: z.string().optional(),
  customId: z.string().optional(),
});
export const AgentInfoSchema = z.object({
  id: AgentIdSchema,
  command: z.string(),
  version: z.string().nullable(),
  available: z.boolean(),
  customId: z.string().optional(),
  name: z.string().optional(),
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

// The one custom agent shape (D25): the catalog, the launcher and the settings panel all use it.
export const CustomAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  needsYou: z.string().optional(),
});

// Phase 5: the command bar and voice (D45 to D51).
export const SnapshotConsoleSchema = z.object({
  id: z.string(), title: z.string(), agent: AgentIdSchema, customId: z.string().optional(),
  status: ConsoleStatusSchema, branch: z.string().optional(), cwd: z.string(),
  workspaceId: z.string(), idleSeconds: z.number().int().nonnegative(),
});
export const BoardSnapshotSchema = z.object({
  repoPath: z.string(), activeWorkspaceId: z.string(),
  workspaces: z.array(z.object({ id: z.string(), name: z.string() })),
  consoles: z.array(SnapshotConsoleSchema),
  agents: z.array(AgentInfoSchema),
});
const step = { id: z.string(), summary: z.string(), detail: z.string().optional(), asks: z.boolean() };
export const PlanStepSchema = z.discriminatedUnion("kind", [
  z.object({ ...step, kind: z.literal("spawn"), agent: AgentIdSchema, customId: z.string().optional(), worktree: z.string().optional(), prompt: z.string().optional(), near: z.string().optional() }),
  z.object({ ...step, kind: z.literal("close"), consoleIds: z.array(z.string()).min(1) }),
  z.object({ ...step, kind: z.literal("resume"), consoleId: z.string() }),
  z.object({ ...step, kind: z.literal("focus"), consoleId: z.string() }),
  z.object({ ...step, kind: z.literal("fit") }),
  z.object({ ...step, kind: z.literal("note"), text: z.string() }),
  z.object({ ...step, kind: z.literal("input"), consoleId: z.string(), text: z.string() }),
]);
export const PlannedBySchema = z.union([z.literal("rules"), z.object({ model: z.string(), url: z.string() })]);
export const PlanSchema = z.object({
  id: z.string(), text: z.string(), steps: z.array(PlanStepSchema),
  plannedBy: PlannedBySchema, ms: z.number().nonnegative(),
  /** One or two spoken sentences: what will happen and what needs an OK. */
  reply: z.string(),
  /** Set when nothing could be planned; steps is then empty. */
  unknown: z.string().optional(),
});
export const PlanRequestSchema = z.object({ text: z.string().min(1), repo: z.string() });
export const RunRequestSchema = z.object({ plan: PlanSchema, confirmed: z.array(z.string()), skipped: z.array(z.string()) });
export const StepResultSchema = z.object({ stepId: z.string(), status: z.enum(["done", "skipped", "failed"]), error: z.string().optional(), consoleId: z.string().optional() });
/** focus and fit are the page's to perform; the daemon only reports them. */
export const RunResponseSchema = z.object({ results: z.array(StepResultSchema), focus: z.string().optional(), fit: z.boolean().optional() });
export const TranscribeResponseSchema = z.object({ text: z.string(), ms: z.number().nonnegative(), engine: z.string() });
export const PlannerSettingsSchema = z.object({ url: z.string().url(), model: z.string() });
export const VoiceSettingsSchema = z.object({ transcribeCommand: z.string(), holdKey: z.literal("alt+space") });

// ~/.agentboard/settings.json
export const SettingsSchema = z.object({ fontSize: z.number(), customAgents: z.array(CustomAgentSchema), planner: PlannerSettingsSchema.optional(), voice: VoiceSettingsSchema.optional() });
export const OpenRequestSchema = z.object({ editor: z.enum(["code", "zed", "finder"]), path: z.string() });
