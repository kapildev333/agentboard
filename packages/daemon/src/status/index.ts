import { mapSignal, type AgentId, type ConsoleStatus } from "@agentboard/shared";

export type StatusRules = { needsYou?: RegExp[]; idle?: RegExp[] };
export type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const QUIET_MS = 20_000;

type Entry = { agent: AgentId; rules: StatusRules; status: ConsoleStatus; timer?: unknown; armed?: boolean };

export class StatusTracker {
  private entries = new Map<string, Entry>();
  private listeners = new Set<(id: string, status: ConsoleStatus, previous: ConsoleStatus) => void>();

  constructor(
    private timers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as never) },
  ) {}

  markStarting(consoleId: string, agent: AgentId, options: StatusRules = {}): void {
    // keep the old status so a restart reports its real previous and a repeat call emits nothing
    this.clearTimer(consoleId);
    this.entries.set(consoleId, { agent, rules: options, status: this.get(consoleId) });
    this.set(consoleId, "starting");
  }

  handleHook(consoleId: string, body: { event: string; payload?: unknown }): void {
    const e = this.entries.get(consoleId);
    if (!e || e.status === "exited") return;
    const next = mapSignal(e.agent, body.event, body.payload);
    if (!next) return;
    if (next === "idle") e.armed = false;
    this.set(consoleId, next);
  }

  // codex: a carriage return means a prompt was sent, so output until agent-turn-complete is work
  markInput(consoleId: string, data: string): void {
    const e = this.entries.get(consoleId);
    if (e?.agent === "codex" && data.includes("\r")) e.armed = true;
  }

  markOutput(consoleId: string, chunk: string): void {
    const e = this.entries.get(consoleId);
    if (!e || e.status === "exited") return;
    // hooks and plugins are authoritative once running; the first output only ends starting
    if (e.agent !== "codex" && e.agent !== "custom") {
      if (e.status === "starting") this.set(consoleId, "idle");
      return;
    }
    const match = (res?: RegExp[]) => res?.some((r) => chunk.search(r) !== -1);
    let next: ConsoleStatus | null = null;
    // needs_you wins over idle
    if (match(e.rules.needsYou)) next = "needs_you";
    else if (e.agent === "custom" && match(e.rules.idle)) next = "idle";
    else if (e.agent === "custom" || e.armed) next = "working";
    else if (e.status === "starting") next = "idle";
    if (next) this.set(consoleId, next);
    this.clearTimer(consoleId);
    // only custom consoles go idle from silence; codex waits for its notify hook
    if (e.agent === "custom" && next === "working") e.timer = this.timers.set(() => this.set(consoleId, "idle"), QUIET_MS);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- code is part of the card's signature
  markExit(consoleId: string, _code?: number | null): void {
    this.set(consoleId, "exited");
  }

  get(consoleId: string): ConsoleStatus {
    return this.entries.get(consoleId)?.status ?? "stopped";
  }

  onChange(cb: (id: string, status: ConsoleStatus, previous: ConsoleStatus) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  remove(consoleId: string): void {
    this.clearTimer(consoleId);
    this.entries.delete(consoleId);
  }

  private clearTimer(consoleId: string): void {
    const e = this.entries.get(consoleId);
    if (e?.timer !== undefined) this.timers.clear(e.timer);
    if (e) e.timer = undefined;
  }

  private set(consoleId: string, status: ConsoleStatus): void {
    const e = this.entries.get(consoleId);
    if (!e || e.status === status) return;
    const previous = e.status;
    e.status = status;
    if (status === "exited") this.clearTimer(consoleId);
    for (const cb of this.listeners) cb(consoleId, status, previous);
  }
}
