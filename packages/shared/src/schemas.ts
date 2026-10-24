import { z } from "zod";
import { nodeBase } from "./base.js";
import { ImageNodeSchema, SavedLayoutSchema, StrokeSchema, TextNodeSchema } from "./extras.js";

export const AgentIdSchema = z.enum(["claude", "codex", "gemini", "opencode", "custom"]);
export const ConsoleStatusSchema = z.enum(["stopped", "starting", "working", "idle", "needs_you", "exited"]);
export const SignalSchema = z.enum(["hooks", "plugin", "notify", "heuristic"]);

export const DaemonInfoSchema = z.object({ port: z.number().int(), token: z.string(), pid: z.number().int() });

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
export const WebTileNodeSchema = z.object({ ...nodeBase, type: z.literal("webtile"), url: z.string(), capture: z.boolean().optional() });
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
  TextNodeSchema,
  ImageNodeSchema,
]);

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
  nodes: z.array(BoardNodeSchema),
  ink: z.array(StrokeSchema).optional(),
  layouts: z.array(SavedLayoutSchema).optional(),
  /** Phase 4; lazy because TeamSchema lives in the phase 4 block at the end. */
  teams: z.array(z.lazy(() => TeamSchema)).optional(),
});
export const BoardSchema = z.object({
  version: z.literal(1),
  /** Counts the saves of PUT /api/board; a PUT older than the saved one is refused (409), one without a rev is not checked. Optional so a board file from before it existed still loads. */
  rev: z.number().int().nonnegative().optional(),
  repoPath: z.string(),
  activeWorkspaceId: z.string(),
  workspaces: z.array(WorkspaceSchema),
});
// SchemaName in routes.ts is keyed on this module, so the phase 3 schemas surface here too.
export * from "./extras.js";

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
  z.object({ t: z.literal("event"), event: z.lazy(() => EventSchema) }),
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
  profileId: z.string().optional(),
  role: z.string().optional(),
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
export const StatusResponseSchema = z.object({
  consoles: z.array(ConsoleNodeSchema),
  /** Phase 4; optional until the daemon fills it. */
  summaries: z.array(z.lazy(() => ConsoleSummarySchema)).optional(),
});
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
export const SettingsSchema = z.object({
  fontSize: z.number(),
  customAgents: z.array(CustomAgentSchema),
  planner: PlannerSettingsSchema.optional(),
  voice: VoiceSettingsSchema.optional(),
  // Phase 4: absent in an old file; readers default them to [], [] and { offerAtSpawn: false }.
  profiles: z.array(z.lazy(() => ProfileSchema)).optional(),
  composerTemplates: z.array(z.lazy(() => ComposerTemplateSchema)).optional(),
  memory: z.object({ offerAtSpawn: z.boolean() }).optional(),
});
export const OpenRequestSchema = z.object({ editor: z.enum(["code", "zed", "finder"]), path: z.string() });

// Phase 4: orchestration and continuity

export const TextSchema = z.string();

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  roles: z.array(z.object({ name: z.string(), consoleId: z.string().nullable(), order: z.number().int() })),
  brief: z.string(),
  triggers: z.object({ handoffOnIdle: z.boolean(), includeDiff: z.boolean(), startStopped: z.boolean() }),
  collapsed: z.boolean(),
});

export const ConsoleSummarySchema = ConsoleNodeSchema.extend({
  lastLine: z.string(),
  teamId: z.string().optional(),
  role: z.string().optional(),
  loopId: z.string().optional(),
  repoPath: z.string(),
});

export const EventKindSchema = z.enum(["hook", "status", "spawn", "exit", "handoff", "loop", "memory", "security"]);
export const EventSchema = z.object({
  id: z.string(),
  ts: z.string(),
  kind: EventKindSchema,
  consoleId: z.string().optional(),
  agent: AgentIdSchema.optional(),
  title: z.string().optional(),
  detail: z.string(),
  status: ConsoleStatusSchema.optional(),
});
export const EventListSchema = z.array(EventSchema);
// Query strings arrive as strings, so limit is coerced.
export const EventsQuerySchema = z.object({ since: z.string().optional(), limit: z.coerce.number().int().positive().optional() });

export const HandoffBriefSchema = z.object({
  done: z.array(z.string()),
  left: z.array(z.string()),
  decisions: z.array(z.string()),
  ask: z.string(),
});
export const HandoffTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("console"), consoleId: z.string() }),
  z.object({ kind: z.literal("spawn"), agent: AgentIdSchema, customId: z.string().optional(), worktree: z.string().optional(), title: z.string() }),
]);
export const HandoffSchema = z.object({
  id: z.string(),
  fromConsoleId: z.string(),
  teamId: z.string().optional(),
  target: HandoffTargetSchema,
  brief: HandoffBriefSchema,
  attachments: z.object({ diff: z.boolean(), teamBrief: z.boolean(), lastLines: z.boolean(), files: z.array(z.string()) }),
  after: z.object({ markHandedOff: z.boolean(), focusTarget: z.boolean(), addNote: z.boolean() }),
  createdAt: z.string(),
  sentAt: z.string().optional(),
  promptText: z.string(),
});
export const HandoffListSchema = z.array(HandoffSchema);
export const HandoffDraftRequestSchema = z.object({ fromConsoleId: z.string(), teamId: z.string().optional() });
export const HandoffQuerySchema = z.object({ console: z.string().optional() });
export const HandoffSendResponseSchema = z.object({ consoleId: z.string() });

export const LoopTriggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("schedule"), cron: z.string() }),
  z.object({ kind: z.literal("idle"), delaySec: z.number().nonnegative() }),
  z.object({ kind: z.literal("output"), pattern: z.string() }),
]);
export const LoopStopSchema = z.object({
  goal: z.object({ pattern: z.string(), op: z.enum(["lte", "gte", "eq"]), value: z.number() }).optional(),
  maxRuns: z.number().int().positive().optional(),
  timeBoxMin: z.number().positive().optional(),
});
export const LoopStateSchema = z.enum(["running", "scheduled", "paused", "retired"]);
export const LoopRunSchema = z.object({
  n: z.number().int().positive(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  outcome: z.string(),
  tokens: z.number().nullable(),
});
export const LoopSchema = z.object({
  id: z.string(),
  consoleId: z.string(),
  name: z.string(),
  trigger: LoopTriggerSchema,
  stop: LoopStopSchema,
  prompt: z.string(),
  state: LoopStateSchema,
  pausedReason: z.string().optional(),
  runs: z.array(LoopRunSchema),
  createdAt: z.string(),
});
export const LoopListSchema = z.array(LoopSchema);
/** What a client sends to create or edit a loop; the daemon owns id, state, runs and createdAt. */
export const LoopRequestSchema = LoopSchema.pick({ consoleId: true, name: true, trigger: true, stop: true, prompt: true });

export const ComposerSlotSchema = z.object({
  agent: AgentIdSchema,
  customId: z.string().optional(),
  profileId: z.string().optional(),
  role: z.string().optional(),
  prompt: z.string(),
  useShared: z.boolean(),
});
export const ComposerLaunchRequestSchema = z.object({
  cwd: z.string(),
  baseBranch: z.string(),
  placement: z.enum(["grid", "besideCaller"]),
  callerConsoleId: z.string().optional(),
  sharedPrompt: z.string(),
  makeTeam: z.boolean(),
  teamName: z.string().optional(),
  staggerSec: z.number().nonnegative(),
  slots: z.array(ComposerSlotSchema).min(1).max(12),
});
export const ComposerLaunchResponseSchema = z.object({ consoleIds: z.array(z.string()), teamId: z.string().optional() });
/** shared is the template's shared prompt. */
export const ComposerTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  slots: z.array(ComposerSlotSchema).min(1).max(12),
  shared: z.string(),
});
export const ComposerTemplateListSchema = z.array(ComposerTemplateSchema);

export const UsageRangeSchema = z.enum(["today", "14d", "30d", "all"]);
export const UsageQuerySchema = z.object({
  range: UsageRangeSchema.default("14d"),
  group: z.enum(["agent", "repo", "console"]).default("agent"),
});
export const UsageReportSchema = z.object({
  range: UsageRangeSchema,
  totals: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    sessions: z.number().int(),
    medianSessionMin: z.number(),
    needsYouWaitSec: z.number(),
  }),
  // Partial: a day without a gemini session has no gemini key.
  byDay: z.array(z.object({ day: z.string(), byAgent: z.partialRecord(AgentIdSchema, z.number()) })),
  groups: z.array(z.object({
    key: z.string(),
    label: z.string(),
    agent: AgentIdSchema.optional(),
    sessions: z.number().int(),
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
  })),
  sources: z.array(z.object({ agent: AgentIdSchema, path: z.string(), files: z.number().int() })),
  checkedAt: z.string(),
});

export const MemoryScopeSchema = z.enum(["repo", "global"]);
export const MemorySourceSchema = z.object({
  kind: z.enum(["user", "handoff", "session", "proposal"]),
  consoleId: z.string().optional(),
  label: z.string(),
});
export const MemoryItemSchema = z.object({
  id: z.string(),
  scope: MemoryScopeSchema,
  title: z.string(),
  body: z.string(),
  source: MemorySourceSchema,
  state: z.enum(["kept", "proposed"]),
  createdAt: z.string(),
  pushed: z.array(z.object({ consoleId: z.string(), at: z.string() })),
});
export const MemoryItemListSchema = z.array(MemoryItemSchema);
/** Without repo, only the global items. */
export const MemoryQuerySchema = z.object({ repo: z.string().optional() });
/** repo picks the store a repo-scoped item goes to. */
export const MemoryAddRequestSchema = z.object({
  repo: z.string().optional(),
  scope: MemoryScopeSchema,
  title: z.string(),
  body: z.string(),
  source: MemorySourceSchema.optional(),
});
export const MemoryProposeRequestSchema = z.object({
  repo: z.string().optional(),
  title: z.string(),
  body: z.string(),
  consoleId: z.string().optional(),
});
export const MemoryPushRequestSchema = z.object({ consoleIds: z.union([z.array(z.string()), z.literal("workspace")]) });
export const MemoryPushResponseSchema = z.object({ pushed: z.array(z.string()) });

export const ProfileSchema = z.object({
  id: z.string(),
  agent: AgentIdSchema,
  name: z.string(),
  env: z.record(z.string(), z.string()),
  args: z.array(z.string()),
});
