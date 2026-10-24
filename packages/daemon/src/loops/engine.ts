import { randomUUID } from "node:crypto";
import { stripVTControlCharacters } from "node:util";
import type { BoardEvent, ConsoleStatus, Loop, LoopRequest } from "@agentboard/shared";
import { nextRun, parseCron } from "./cron.js";

export type LoopDeps = {
  /** Types into the console's PTY. */
  write: (consoleId: string, data: string) => void;
  status: (consoleId: string) => ConsoleStatus;
  save: (loops: Loop[]) => void;
  event: (event: BoardEvent) => void;
  /** Tokens the console spent in [from, to]; null until usage parsing exists (L4A). */
  tokensSince?: (consoleId: string, from: Date, to: Date) => number | null;
  clock?: { now: () => number; setTimeout: (fn: () => void, ms: number) => unknown; clearTimeout: (handle: unknown) => void };
};

/** A refused request; the server answers its status and message. */
export class LoopError extends Error {
  constructor(readonly status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

// Runtime per loop: the armed timer, the output since the current run started (undefined: no run), an output match waiting for idle.
type Live = { timer?: unknown; since?: string; pending?: boolean };

const KEEP = 64 * 1024; // ponytail: chars of output kept per console and per run; a goal line older than that is missed
const MAX_DELAY = 2 ** 31 - 1;
const OPS = { lte: "<=", gte: ">=", eq: "=" } as const;
const pad = (n: number) => String(n).padStart(2, "0");
// A carriage return without a newline redraws the line, so only what follows the last one shows.
const lines = (text: string) => stripVTControlCharacters(text).split("\n").map((l) => l.slice(l.lastIndexOf("\r", l.length - 2) + 1).trim());
const met = (op: "lte" | "gte" | "eq", v: number, goal: number) => (op === "lte" ? v <= goal : op === "gte" ? v >= goal : v === goal);
const between = (l: Loop) => (l.trigger.kind === "schedule" ? "scheduled" : "running");
// "p95 (\d+)ms" lte 12 reads "p95 <= 12": the pattern's text before its first group names the number.
const goalText = (l: Loop) => (l.stop.goal ? `${l.stop.goal.pattern.split("(")[0]!.trim()} ${OPS[l.stop.goal.op]} ${l.stop.goal.value}`.trim() : "");

/**
 * Re-prompts a console on a trigger until a stop condition holds. A prompt is typed only while the console is idle,
 * a console that needs you pauses its loops, and one that exits retires them (P4-D45).
 */
export class LoopEngine {
  private loops = new Map<string, Loop>();
  private live = new Map<string, Live>();
  private out = new Map<string, { tail: string; partial: string }>();
  private clock: NonNullable<LoopDeps["clock"]>;

  constructor(private deps: LoopDeps, loops: Loop[] = []) {
    // looked up per call, so vitest's fake timers apply to an engine built before them
    this.clock = deps.clock ?? { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout) };
    for (const l of loops) {
      this.loops.set(l.id, l);
      // a run the last daemon left open never sees its end
      const last = l.runs.at(-1);
      if (last?.outcome === "running") Object.assign(last, { outcome: "interrupted", endedAt: this.iso() });
      if (l.state === "running" || l.state === "scheduled") l.state = between(l);
      this.arm(l);
    }
  }

  list(): Loop[] {
    return [...this.loops.values()];
  }

  get(id: string): Loop | undefined {
    return this.loops.get(id);
  }

  create(req: LoopRequest): Loop {
    validate(req);
    const { consoleId, name, trigger, stop, prompt } = req;
    const l: Loop = { id: randomUUID(), consoleId, name, trigger, stop, prompt, state: "running", runs: [], createdAt: this.iso() };
    l.state = between(l);
    this.loops.set(l.id, l);
    this.arm(l);
    this.changed(l, "created");
    return l;
  }

  update(id: string, req: LoopRequest): Loop {
    const l = this.must(id);
    validate(req);
    this.disarm(l);
    const { consoleId, name, trigger, stop, prompt } = req;
    Object.assign(l, { consoleId, name, trigger, stop, prompt });
    if ((l.state === "running" || l.state === "scheduled") && this.at(l).since === undefined) l.state = between(l);
    this.arm(l);
    this.changed(l, "edited");
    return l;
  }

  remove(id: string): void {
    const l = this.must(id);
    this.disarm(l);
    this.loops.delete(id);
    this.live.delete(id);
    this.changed(l, "deleted");
  }

  pause(id: string): Loop {
    const l = this.must(id);
    if (l.state === "retired") throw new LoopError(409, "the loop is retired");
    this.disarm(l);
    l.state = "paused";
    l.pausedReason = "paused by you";
    this.changed(l, "paused by you");
    return l;
  }

  resume(id: string): Loop {
    const l = this.must(id);
    if (l.state === "retired") throw new LoopError(409, "the loop is retired");
    l.state = this.at(l).since === undefined ? between(l) : "running";
    delete l.pausedReason;
    this.arm(l);
    this.changed(l, "resumed");
    return l;
  }

  runNow(id: string): Loop {
    const l = this.must(id);
    if (l.state === "retired" || l.state === "paused") throw new LoopError(409, `the loop is ${l.state}`);
    if (this.at(l).since !== undefined) throw new LoopError(409, "a run is in progress");
    const status = this.deps.status(l.consoleId);
    if (status !== "idle") throw new LoopError(409, `the console is ${status.replace("_", " ")}, not idle`);
    this.fire(l);
    return l;
  }

  /** Stops every timer, for daemon shutdown. */
  close(): void {
    for (const l of this.loops.values()) this.disarm(l);
  }

  /** Feed of the console's status changes; exited also covers the PTY exit. */
  onStatus(consoleId: string, status: ConsoleStatus): void {
    for (const l of this.loops.values()) {
      if (l.consoleId !== consoleId || l.state === "retired") continue;
      const live = this.at(l);
      if (status === "exited") {
        this.endRun(l, "console exited");
        this.retire(l, "console exited");
      } else if (status === "needs_you") {
        // never answers: the run is over and nothing is typed until someone resumes the loop
        this.endRun(l, "needed you");
        if (l.state === "paused") continue;
        this.disarm(l);
        const t = new Date(this.clock.now());
        l.state = "paused";
        l.pausedReason = `console needed you at ${pad(t.getHours())}:${pad(t.getMinutes())}`;
        this.changed(l, l.pausedReason);
      } else if (status === "idle") {
        if (live.since !== undefined) this.finishRun(l);
        if (["retired", "paused"].includes(l.state)) continue; // finishRun may have retired it
        if (l.trigger.kind === "idle") this.arm(l);
        else if (l.trigger.kind === "output" && live.pending) {
          live.pending = false;
          this.fire(l);
        }
      } else if (l.trigger.kind === "idle") this.disarm(l);
    }
  }

  /** Feed of the console's PTY output. */
  onOutput(consoleId: string, data: string): void {
    const o = this.out.get(consoleId) ?? { tail: "", partial: "" };
    this.out.set(consoleId, o);
    o.tail = (o.tail + data).slice(-KEEP);
    const parts = (o.partial + data).split("\n");
    o.partial = parts.pop()!.slice(-KEEP);
    const complete = lines(parts.join("\n"));
    for (const l of this.loops.values()) {
      if (l.consoleId !== consoleId || l.state === "retired") continue;
      const live = this.at(l);
      if (live.since !== undefined) live.since = (live.since + data).slice(-KEEP);
      if (l.state === "paused" || l.trigger.kind !== "output" || !parts.length) continue;
      const re = new RegExp(l.trigger.pattern);
      if (!complete.some((line) => re.test(line))) continue;
      if (this.deps.status(consoleId) === "idle" && live.since === undefined) this.fire(l);
      else live.pending = true;
    }
  }

  // Refuses silently unless the console is idle and no run is open: a prompt never lands on a question.
  private fire(l: Loop): void {
    const live = this.at(l);
    if (l.state === "paused" || l.state === "retired" || live.since !== undefined || this.deps.status(l.consoleId) !== "idle") return;
    const n = l.runs.length + 1;
    const last = lines(this.out.get(l.consoleId)?.tail ?? "").filter(Boolean).slice(-20).join(" | ");
    const text = l.prompt.replaceAll("{run}", String(n)).replaceAll("{last_output}", last).replaceAll("{goal}", goalText(l));
    // One run is one prompt: a newline inside it would submit early and type the rest into whatever comes next.
    this.deps.write(l.consoleId, text.replace(/[\r\n]+/g, " ") + "\r");
    live.since = "";
    live.pending = false;
    l.runs.push({ n, startedAt: this.iso(), outcome: "running", tokens: null });
    l.state = "running";
    this.changed(l, `run ${n} started`);
  }

  private finishRun(l: Loop): void {
    const run = l.runs.at(-1)!;
    const text = stripVTControlCharacters(this.at(l).since!);
    this.endRun(l, "idle");
    const goal = l.stop.goal;
    const m = goal && [...text.matchAll(new RegExp(goal.pattern, "g"))].at(-1);
    const done = !!m && met(goal!.op, Number(m[1]), goal!.value);
    if (m) run.outcome = `${m[0]} · goal ${done ? "met" : "not met"}`;
    const reason = done
      ? "goal met"
      : l.stop.maxRuns !== undefined && l.runs.length >= l.stop.maxRuns
        ? "max runs"
        : l.stop.timeBoxMin !== undefined && this.clock.now() - Date.parse(l.createdAt) >= l.stop.timeBoxMin * 60_000
          ? "time box"
          : undefined;
    if (reason && !done) run.outcome += ` · ${reason}`;
    if (reason) return this.retire(l, reason);
    if (l.state !== "paused") l.state = between(l);
    this.changed(l, `run ${run.n}: ${run.outcome}`);
  }

  // Closes the open run, if any, with this outcome.
  private endRun(l: Loop, outcome: string): void {
    const live = this.at(l);
    if (live.since === undefined) return;
    live.since = undefined;
    const run = l.runs.at(-1)!;
    run.endedAt = this.iso();
    run.outcome = outcome;
    run.tokens = this.deps.tokensSince?.(l.consoleId, new Date(run.startedAt), new Date(run.endedAt)) ?? null;
  }

  private retire(l: Loop, reason: string): void {
    this.disarm(l);
    l.state = "retired";
    delete l.pausedReason;
    this.changed(l, `retired: ${reason}`);
  }

  private arm(l: Loop): void {
    this.disarm(l);
    if (l.state === "paused" || l.state === "retired") return;
    const live = this.at(l);
    if (l.trigger.kind === "idle") {
      if (this.deps.status(l.consoleId) === "idle" && live.since === undefined) live.timer = this.clock.setTimeout(() => this.fire(l), l.trigger.delaySec * 1000);
    } else if (l.trigger.kind === "schedule") {
      const due = nextRun(parseCron(l.trigger.cron), new Date(this.clock.now())).getTime();
      const wake = () => {
        // a timer caps at about 24 days, so a later run wakes early and waits again
        if (this.clock.now() < due) return void (live.timer = this.clock.setTimeout(wake, Math.min(due - this.clock.now(), MAX_DELAY)));
        this.fire(l);
        this.arm(l);
      };
      live.timer = this.clock.setTimeout(wake, Math.min(due - this.clock.now(), MAX_DELAY));
    }
  }

  private disarm(l: Loop): void {
    const live = this.at(l);
    if (live.timer !== undefined) this.clock.clearTimeout(live.timer);
    live.timer = undefined;
  }

  private at(l: Loop): Live {
    let live = this.live.get(l.id);
    if (!live) this.live.set(l.id, (live = {}));
    return live;
  }

  private must(id: string): Loop {
    const l = this.loops.get(id);
    if (!l) throw new LoopError(404, `no loop ${id}`);
    return l;
  }

  private iso(): string {
    return new Date(this.clock.now()).toISOString();
  }

  private changed(l: Loop, detail: string): void {
    this.deps.save(this.list());
    this.deps.event({ id: randomUUID(), ts: this.iso(), kind: "loop", consoleId: l.consoleId, title: l.name, detail });
  }
}

function validate(req: LoopRequest): void {
  const patterns = [req.trigger.kind === "output" && req.trigger.pattern, req.stop.goal?.pattern].filter((p): p is string => typeof p === "string");
  try {
    for (const p of patterns) new RegExp(p);
    if (req.trigger.kind === "schedule") nextRun(parseCron(req.trigger.cron), new Date());
  } catch (e) {
    throw new LoopError(400, (e as Error).message);
  }
}
