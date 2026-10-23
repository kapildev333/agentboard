import { mapSignal, type AgentId, type ConsoleStatus } from "@agentboard/shared";

export type StatusRules = { needsYou?: RegExp[]; idle?: RegExp[] };

const QUIET_MS = 20_000;

type Entry = { agent: AgentId; rules: StatusRules; status: ConsoleStatus; timer?: ReturnType<typeof setTimeout>; armed?: boolean; ended?: boolean; hooked?: boolean };

export class StatusTracker {
  private entries = new Map<string, Entry>();
  private listeners = new Set<(id: string, status: ConsoleStatus, previous: ConsoleStatus) => void>();

  markStarting(consoleId: string, agent: AgentId, options: StatusRules = {}): void {
    // keep the old status so a restart reports its real previous and a repeat call emits nothing
    this.clearTimer(consoleId);
    this.entries.set(consoleId, { agent, rules: options, status: this.get(consoleId) });
    this.set(consoleId, "starting");
  }

  handleHook(consoleId: string, body: { event: string; payload?: unknown }): void {
    const e = this.entries.get(consoleId);
    if (!e || e.ended) return;
    const next = mapSignal(e.agent, body.event, body.payload);
    if (!next) return;
    if (next === "idle") e.armed = false;
    // from the first hook on, hooks own the status of a hook agent and the output heuristics stop
    e.hooked = true;
    if (e.agent !== "codex") this.clearTimer(consoleId);
    this.set(consoleId, next);
  }

  // codex: a carriage return means a prompt was sent, so output until agent-turn-complete is work
  markInput(consoleId: string, data: string): void {
    const e = this.entries.get(consoleId);
    if (e && data.includes("\r")) e.armed = true;
  }

  markOutput(consoleId: string, chunk: string): void {
    const e = this.entries.get(consoleId);
    if (!e || e.ended) return;
    // hooks and plugins own the status once their first hook has arrived
    if (e.agent !== "codex" && e.agent !== "custom" && e.hooked) return;
    const heuristic = e.agent !== "codex";
    const match = (res?: RegExp[]) => res?.some((r) => chunk.search(r) !== -1);
    let next: ConsoleStatus | null = null;
    // needs_you wins over idle
    if (match(e.rules.needsYou)) next = "needs_you";
    else if (heuristic && match(e.rules.idle)) next = "idle";
    else if (heuristic || e.armed) next = "working";
    else if (e.status === "starting") next = "idle";
    if (next) this.set(consoleId, next);
    this.clearTimer(consoleId);
    // codex goes idle from its notify hook, never from silence
    if (heuristic && next === "working") e.timer = setTimeout(() => this.set(consoleId, "idle"), QUIET_MS);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- code is part of the card's signature
  markExit(consoleId: string, _code?: number | null): void {
    // only a PTY exit is final; a hook-driven exited can be followed by more work (Claude /clear)
    const e = this.entries.get(consoleId);
    if (e) e.ended = true;
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
    if (e?.timer !== undefined) clearTimeout(e.timer);
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
