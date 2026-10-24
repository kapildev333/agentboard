import { randomUUID } from "node:crypto";
import type { AgentId, ConsoleNode, BoardEvent, ConsoleStatus, Handoff, HandoffDraftRequest, Team } from "@agentboard/shared";
import { extractBrief, type DiffStat } from "./extract.js";
import { renderPrompt } from "./render.js";
import { readTranscript } from "./transcript.js";

/** A client error: the server answers its status and message. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export type SpawnRequest = { agent: AgentId; customId?: string; worktree?: string; prompt: string; title: string; role?: string; fromConsoleId: string };
export type HandoffDeps = {
  /** AGENTBOARD_HOME, read per call. */
  home: () => string;
  /** The user's home: where agents keep their logs, and the path no saved brief may show. */
  userHome: string;
  console: (id: string) => { node: ConsoleNode; teams: Team[] } | undefined;
  tracker: { get(id: string): ConsoleStatus; onChange(cb: (id: string, status: ConsoleStatus) => void): () => void };
  replay: (consoleId: string) => string;
  write: (consoleId: string, data: string) => void;
  diff: (path: string) => Promise<{ files: unknown[]; patch: string }>;
  /** Starts a console with the prompt as its first message; returns its id. */
  spawn: (req: SpawnRequest) => Promise<string>;
  /** Starts a stopped console again. */
  resume: (consoleId: string) => Promise<void>;
  event: (e: Omit<BoardEvent, "id" | "ts">) => void;
  /** The board holding this console changed (a team role got its console). */
  changed?: (consoleId: string) => void;
};

const SETTLE_MS = 60_000;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The role after the console's own in the team's handoff order. */
export function nextRole(team: Team | undefined, consoleId: string) {
  const roles = [...(team?.roles ?? [])].sort((a, b) => a.order - b.order);
  const i = roles.findIndex((r) => r.consoleId === consoleId);
  return i < 0 ? undefined : roles[i + 1];
}

export class HandoffService {
  private items = new Map<string, Handoff>();
  private stats = new Map<string, number>(); // diff file counts, for the attachments line on re-render

  constructor(private deps: HandoffDeps) {}

  async draft(req: HandoffDraftRequest): Promise<Handoff> {
    const from = this.deps.console(req.fromConsoleId);
    if (!from) throw new HttpError(404, `no console ${req.fromConsoleId}`);
    const { node, teams } = from;
    const team = req.teamId ? teams.find((t) => t.id === req.teamId) : teams.find((t) => t.roles.some((r) => r.consoleId === node.id));
    const next = nextRole(team, node.id);
    const target: Handoff["target"] =
      next?.consoleId && this.deps.console(next.consoleId)
        ? { kind: "console", consoleId: next.consoleId }
        : { kind: "spawn", agent: node.agent, ...(node.customId && { customId: node.customId }), title: next ? capital(next.name) : `${node.title} handoff` };
    const attachments = { diff: team?.triggers.includeDiff ?? true, teamBrief: !!team, lastLines: false, files: [] };
    const stat = attachments.diff ? await this.diffStat(node) : null;
    const turns = await readTranscript(node, { home: this.deps.userHome, replay: this.deps.replay });
    const handoff: Handoff = {
      id: randomUUID(),
      fromConsoleId: node.id,
      ...(team && { teamId: team.id }),
      target,
      brief: extractBrief(turns, stat),
      attachments,
      after: { markHandedOff: true, focusTarget: true, addNote: false },
      createdAt: new Date().toISOString(),
      promptText: "",
    };
    this.stats.set(handoff.id, stat?.files ?? 0);
    return this.store(handoff);
  }

  async update(id: string, edited: Handoff): Promise<Handoff> {
    const old = this.mustGet(id);
    return this.store({ ...edited, id, fromConsoleId: old.fromConsoleId, createdAt: old.createdAt });
  }

  async send(id: string, opts: { startStopped?: boolean } = {}): Promise<{ consoleId: string }> {
    const h = this.mustGet(id);
    const { target } = h;
    let consoleId: string;
    let title: string;
    if (target.kind === "console") {
      consoleId = target.consoleId;
      const to = this.deps.console(consoleId);
      if (!to) throw new HttpError(404, `no console ${consoleId}`);
      title = to.node.title;
      // P4-D45: a prompt goes into a PTY only while its console is idle or freshly started, never into a question.
      let status = this.deps.tracker.get(consoleId);
      if (opts.startStopped && (status === "stopped" || status === "exited")) {
        await this.deps.resume(consoleId);
        status = await this.settle(consoleId);
      }
      if (status === "needs_you") throw new HttpError(409, `${title} needs you; a handoff never answers a prompt`);
      if (status !== "idle") throw new HttpError(409, `${title} is ${status}; a handoff waits until it is idle`);
      this.deps.write(consoleId, h.promptText + "\r");
    } else {
      title = target.title;
      const role = nextRole(this.teamOf(h), h.fromConsoleId);
      consoleId = await this.deps.spawn({
        agent: target.agent,
        ...(target.customId && { customId: target.customId }),
        ...(target.worktree && { worktree: target.worktree }),
        prompt: h.promptText,
        title,
        ...(role && { role: role.name }),
        fromConsoleId: h.fromConsoleId,
      });
      // The new console takes the role it was started for.
      if (role && !role.consoleId) {
        role.consoleId = consoleId;
        this.deps.changed?.(consoleId);
      }
    }
    const from = this.deps.console(h.fromConsoleId)?.node;
    this.items.set(id, { ...h, sentAt: new Date().toISOString() });
    this.deps.event({ kind: "handoff", consoleId: h.fromConsoleId, ...(from && { agent: from.agent, title: from.title }), detail: `handed off to ${title}` });
    return { consoleId };
  }

  list(consoleId?: string): Handoff[] {
    return [...this.items.values()]
      .filter((h) => !consoleId || h.fromConsoleId === consoleId || (h.target.kind === "console" && h.target.consoleId === consoleId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private mustGet(id: string): Handoff {
    const h = this.items.get(id);
    if (!h) throw new HttpError(404, `no handoff ${id}`);
    return h;
  }

  private teamOf(h: Handoff): Team | undefined {
    return this.deps.console(h.fromConsoleId)?.teams.find((t) => t.id === h.teamId);
  }

  // Renders the prompt from the brief and keeps the handoff.
  private async store(h: Handoff): Promise<Handoff> {
    const team = this.teamOf(h);
    const from = this.deps.console(h.fromConsoleId)?.node.title ?? "a console";
    const t = h.target;
    const toRole = t.kind === "console" ? team?.roles.find((r) => r.consoleId === t.consoleId)?.name : nextRole(team, h.fromConsoleId)?.name;
    const saved = { ...h, promptText: renderPrompt(h, team, from, toRole, this.stats.get(h.id) ?? 0) };
    this.items.set(h.id, saved);
    return saved;
  }

  private async diffStat(node: ConsoleNode): Promise<DiffStat | null> {
    try {
      const d = await this.deps.diff(node.worktree?.path ?? node.cwd);
      const lines = d.patch.split("\n");
      return {
        files: d.files.length,
        added: lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length,
        removed: lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length,
      };
    } catch {
      return null; // not a git repo
    }
  }

  // The first settled status after a start: idle, needs_you, or exited; anything else after SETTLE_MS.
  private settle(consoleId: string): Promise<ConsoleStatus> {
    return new Promise((resolve) => {
      const done = (s: ConsoleStatus) => {
        clearTimeout(timer);
        off();
        resolve(s);
      };
      const timer = setTimeout(() => done(this.deps.tracker.get(consoleId)), SETTLE_MS);
      const off = this.deps.tracker.onChange((id, s) => {
        if (id === consoleId && (s === "idle" || s === "needs_you" || s === "exited")) done(s);
      });
    });
  }
}
