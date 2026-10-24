import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { BoardEvent } from "@agentboard/shared";

const RING = 2000;
const KEEP_DAYS = 7;

/** Events kept in memory (last 2000) and appended to <home>/events/<yyyy-mm-dd>.jsonl, never rewritten (P4-D49). */
export class EventLog {
  readonly dir: string;
  private ring: BoardEvent[] = [];
  private listeners = new Set<(event: BoardEvent) => void>();

  constructor(home: string) {
    this.dir = join(home, "events");
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.prune();
  }

  append(event: Omit<BoardEvent, "id" | "ts">): BoardEvent {
    const full: BoardEvent = { ...event, id: randomUUID(), ts: new Date().toISOString() };
    this.ring.push(full);
    if (this.ring.length > RING) this.ring.shift();
    try {
      appendFileSync(join(this.dir, `${full.ts.slice(0, 10)}.jsonl`), JSON.stringify(full) + "\n");
    } catch (e) {
      console.error("agentboard: event write failed:", (e as Error).message);
    }
    for (const l of this.listeners) l(full);
    return full;
  }

  /** Newest last. An unknown `since` (evicted from the ring) returns everything held. */
  list({ since, limit }: { since?: string; limit?: number } = {}): BoardEvent[] {
    const at = since ? this.ring.findIndex((e) => e.id === since) : -1;
    const out = this.ring.slice(at + 1);
    return limit ? out.slice(-limit) : out;
  }

  onEvent(listener: (event: BoardEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Day files are named by UTC date, so a name older than the cutoff date is older than 7 days.
  private prune(): void {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
    for (const f of readdirSync(this.dir))
      if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) < cutoff) rmSync(join(this.dir, f), { force: true });
  }
}
