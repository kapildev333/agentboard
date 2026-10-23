import { mapSignal, type AgentId, type ConsoleStatus } from "@agentboard/shared";

export type StatusRules = { needsYou?: RegExp[]; idle?: RegExp[] };
export type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const QUIET_MS = 20_000;

type Entry = { agent: AgentId; rules: StatusRules; status: ConsoleStatus; timer?: unknown };

export class StatusTracker {
  private entries = new Map<string, Entry>();
  private listeners = new Set<(id: string, status: ConsoleStatus, previous: ConsoleStatus) => void>();

  constructor(
    private timers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as never) },
  ) {}

  markStarting(consoleId: string, agent: AgentId, options: StatusRules = {}): void {
    this.remove(consoleId);
    this.entries.set(consoleId, { agent, rules: options, status: "stopped" });
    this.set(consoleId, "starting");
  }

  handleHook(consoleId: string, body: { event: string; payload?: unknown }): void {
    const e = this.entries.get(consoleId);
    const next = e && mapSignal(e.agent, body.event, body.payload);
    if (next) this.set(consoleId, next);
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
