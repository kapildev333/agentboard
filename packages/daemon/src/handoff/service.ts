import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { HandoffListSchema, type AgentId, type BoardEvent, type ConsoleNode, type ConsoleStatus, type Handoff, type HandoffDraftRequest, type Team } from "@agentboard/shared";
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
  private loaded?: Promise<Map<string, Handoff>>;
  private chain: Promise<void> = Promise.resolve();

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
    return this.store(handoff, stat);
  }

  async update(id: string, edited: Handoff): Promise<Handoff> {
    const old = await this.mustGet(id);
    // The diff is read again, so the count is current and survives a daemon restart.
    const node = this.deps.console(old.fromConsoleId)?.node;
    const stat = edited.attachments.diff && node ? await this.diffStat(node) : null;
    return this.store({ ...edited, id, fromConsoleId: old.fromConsoleId, createdAt: old.createdAt }, stat);
  }

  async send(id: string, opts: { startStopped?: boolean } = {}): Promise<{ consoleId: string }> {
    const h = await this.mustGet(id);
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
        // Watching before the resume, so a console that settles while it starts is not missed.
        const settled = this.watchSettle();
        try {
          await this.deps.resume(consoleId);
        } catch (e) {
          settled.off();
          throw e;
        }
        status = await settled.wait(consoleId);
      }
      if (status === "needs_you") throw new HttpError(409, `${title} needs you; a handoff never answers a prompt`);
      if (status !== "idle") throw new HttpError(409, `${title} is ${status}; a handoff waits until it is idle`);
      this.deps.write(consoleId, h.promptText + "\r");
    } else {
      title = target.title;
      const role = nextRole(this.teamOf(h), h.fromConsoleId);
      // A custom agent takes no prompt at launch: it gets the brief once it first settles idle, watched from before
      // the spawn so an early idle is not missed.
      const settled = target.agent === "custom" ? this.watchSettle() : undefined;
      const spawning = this.deps.spawn({
        agent: target.agent,
        ...(target.customId && { customId: target.customId }),
        ...(target.worktree && { worktree: target.worktree }),
        prompt: h.promptText,
        title,
        ...(role && { role: role.name }),
        fromConsoleId: h.fromConsoleId,
      });
      try {
        consoleId = await spawning;
      } catch (e) {
        settled?.off();
        throw e;
      }
      const id = consoleId;
      void settled
        ?.wait(id)
        .then((s) => s === "idle" && this.deps.write(id, h.promptText + "\r"))
        .catch((e: Error) => console.error(`agentboard: handoff brief for ${id} not written:`, e.message));
      // The new console takes the role it was started for.
      if (role && !role.consoleId) {
        role.consoleId = consoleId;
        this.deps.changed?.(consoleId);
      }
    }
    const from = this.deps.console(h.fromConsoleId)?.node;
    await this.save({ ...h, sentAt: new Date().toISOString() });
    this.deps.event({ kind: "handoff", consoleId: h.fromConsoleId, ...(from && { agent: from.agent, title: from.title }), detail: `handed off to ${title}` });
    return { consoleId };
  }

  async list(consoleId?: string): Promise<Handoff[]> {
    return [...(await this.items()).values()]
      .filter((h) => !consoleId || h.fromConsoleId === consoleId || (h.target.kind === "console" && h.target.consoleId === consoleId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // The index, read from handoffs.json once, so handoffs outlive a daemon restart.
  private items(): Promise<Map<string, Handoff>> {
    return (this.loaded ??= readFile(join(this.deps.home(), "handoffs.json"), "utf8").then(
      (t) => new Map(HandoffListSchema.parse(JSON.parse(t)).map((h) => [h.id, h])),
      (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return new Map();
        throw e;
      },
    ));
  }

  private async mustGet(id: string): Promise<Handoff> {
    const h = (await this.items()).get(id);
    if (!h) throw new HttpError(404, `no handoff ${id}`);
    return h;
  }

  private teamOf(h: Handoff): Team | undefined {
    return this.deps.console(h.fromConsoleId)?.teams.find((t) => t.id === h.teamId);
  }

  // Renders the prompt from the brief and keeps the handoff.
  private async store(h: Handoff, stat: DiffStat | null): Promise<Handoff> {
    const team = this.teamOf(h);
    const from = this.deps.console(h.fromConsoleId)?.node.title ?? "a console";
    const t = h.target;
    const toRole = t.kind === "console" ? team?.roles.find((r) => r.consoleId === t.consoleId)?.name : nextRole(team, h.fromConsoleId)?.name;
    const brief = { ...h.brief, done: h.brief.done.map(this.scrub), left: h.brief.left.map(this.scrub), decisions: h.brief.decisions.map(this.scrub) };
    const scrubbed = { ...h, brief };
    const saved = { ...scrubbed, promptText: this.scrub(renderPrompt(scrubbed, team, from, toRole, stat?.files ?? 0)) };
    await this.save(saved);
    return saved;
  }

  // Under the home, any path is shown with ~ so no saved brief carries the user's home.
  // Only where the home ends at a separator or the end, so a longer name such as <home>2 stays as it is.
  private scrub = (s: string) => {
    const home = this.deps.userHome;
    return home ? s.replace(new RegExp(`${home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[\\\\/]|$)`, "gm"), "~") : s;
  };

  // <home>/handoffs/<id>.md and the handoffs.json index, each written to a .tmp, synced and renamed (P4-D49),
  // one write at a time so the .tmp names never collide.
  private async save(h: Handoff): Promise<void> {
    const items = await this.items();
    items.set(h.id, h);
    const home = this.deps.home();
    const write = async (file: string, text: string) => {
      const fh = await open(`${file}.tmp`, "w", 0o600);
      try {
        await fh.writeFile(text);
        await fh.sync();
      } finally {
        await fh.close();
      }
      await rename(`${file}.tmp`, file);
    };
    const run = this.chain.then(async () => {
      await mkdir(join(home, "handoffs"), { recursive: true, mode: 0o700 });
      await write(join(home, "handoffs", `${h.id}.md`), h.promptText);
      await write(join(home, "handoffs.json"), JSON.stringify([...items.values()], null, 2));
    });
    this.chain = run.catch(() => {});
    return run;
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

  // The first settled status (idle, needs_you or exited) of a console about to start, or its status after SETTLE_MS.
  // It listens from the call on and keeps what arrives before wait() names the console.
  private watchSettle(): { wait(consoleId: string): Promise<ConsoleStatus>; off(): void } {
    const seen = new Map<string, ConsoleStatus>();
    let waiting: { id: string; done(s: ConsoleStatus): void } | undefined;
    const off = this.deps.tracker.onChange((id, s) => {
      if (s !== "idle" && s !== "needs_you" && s !== "exited") return;
      if (waiting?.id === id) waiting.done(s);
      else if (!seen.has(id)) seen.set(id, s);
    });
    return {
      off,
      wait: (consoleId) =>
        new Promise((resolve) => {
          const done = (s: ConsoleStatus) => {
            clearTimeout(timer);
            off();
            resolve(s);
          };
          const timer = setTimeout(() => done(this.deps.tracker.get(consoleId)), SETTLE_MS);
          const early = seen.get(consoleId);
          if (early) done(early);
          else waiting = { id: consoleId, done };
        }),
    };
  }
}
