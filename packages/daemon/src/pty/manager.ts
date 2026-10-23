import { spawn as ptySpawn, type IPty } from "node-pty";

export type SpawnOptions = {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
};
export type PtyHandle = { id: string; pid: number };

type Entry = { pty: IPty; exitCode?: number; buffer: string };

const REPLAY_CHARS = 200 * 1024; // ponytail: counts UTF-16 chars, not bytes; fine for terminal output

export type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

const KILL_GRACE_MS = 5000;

export class PtyManager {
  private entries = new Map<string, Entry>();

  constructor(private timers: Timers = { set: setTimeout, clear: (h) => clearTimeout(h as NodeJS.Timeout) }) {}

  spawn(o: SpawnOptions): PtyHandle {
    if (this.entries.has(o.id)) throw new Error(`console ${o.id} already exists`);
    const pty = ptySpawn(o.command, o.args, { name: "xterm-256color", cwd: o.cwd, env: o.env, cols: o.cols, rows: o.rows });
    const entry: Entry = { pty, buffer: "" };
    pty.onData((d) => {
      entry.buffer += d;
      if (entry.buffer.length > 2 * REPLAY_CHARS) entry.buffer = entry.buffer.slice(-REPLAY_CHARS);
    });
    pty.onExit(({ exitCode }) => (entry.exitCode = exitCode));
    this.entries.set(o.id, entry);
    return { id: o.id, pid: pty.pid };
  }

  write(id: string, data: string): void {
    this.get(id).pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const e = this.get(id);
    if (e.exitCode === undefined) e.pty.resize(cols, rows);
  }

  onData(id: string, cb: (data: string) => void): () => void {
    const d = this.get(id).pty.onData(cb);
    return () => d.dispose();
  }

  onExit(id: string, cb: (code: number) => void): () => void {
    const e = this.get(id);
    if (e.exitCode !== undefined) {
      cb(e.exitCode);
      return () => {};
    }
    const d = e.pty.onExit(({ exitCode }) => cb(exitCode));
    return () => d.dispose();
  }

  async kill(id: string): Promise<void> {
    const e = this.get(id);
    if (e.exitCode === undefined) {
      const exit = new Promise<void>((resolve) => e.pty.onExit(() => resolve()));
      this.signal(e, "SIGHUP");
      const timer = this.timers.set(() => this.signal(e, "SIGKILL"), KILL_GRACE_MS);
      await exit;
      this.timers.clear(timer);
    }
    this.entries.delete(id);
  }

  replay(id: string): string {
    return this.get(id).buffer.slice(-REPLAY_CHARS);
  }

  list(): string[] {
    return [...this.entries.keys()];
  }

  // The child leads its own session, so -pid reaches everything it started.
  private signal(e: Entry, sig: "SIGHUP" | "SIGKILL"): void {
    try {
      process.kill(-e.pty.pid, sig);
    } catch {
      // group already gone
    }
  }

  private get(id: string): Entry {
    const e = this.entries.get(id);
    if (!e) throw new Error(`no console ${id}`);
    return e;
  }
}
