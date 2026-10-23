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

type Entry = { pty: IPty; exited: boolean; buffer: string };

const REPLAY_CHARS = 200 * 1024; // ponytail: counts UTF-16 chars, not bytes; fine for terminal output

export type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

const KILL_GRACE_MS = 5000;

export class PtyManager {
  private entries = new Map<string, Entry>();

  constructor(private timers: Timers = { set: setTimeout, clear: (h) => clearTimeout(h as NodeJS.Timeout) }) {}

  spawn(o: SpawnOptions): PtyHandle {
    const pty = ptySpawn(o.command, o.args, { name: "xterm-256color", cwd: o.cwd, env: o.env, cols: o.cols, rows: o.rows });
    const entry: Entry = { pty, exited: false, buffer: "" };
    pty.onData((d) => (entry.buffer = (entry.buffer + d).slice(-REPLAY_CHARS)));
    pty.onExit(() => (entry.exited = true));
    this.entries.set(o.id, entry);
    return { id: o.id, pid: pty.pid };
  }

  write(id: string, data: string): void {
    this.get(id).pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.get(id).pty.resize(cols, rows);
  }

  onData(id: string, cb: (data: string) => void): () => void {
    const d = this.get(id).pty.onData(cb);
    return () => d.dispose();
  }

  onExit(id: string, cb: (code: number) => void): () => void {
    const d = this.get(id).pty.onExit(({ exitCode }) => cb(exitCode));
    return () => d.dispose();
  }

  async kill(id: string): Promise<void> {
    const e = this.get(id);
    if (!e.exited) {
      const exit = new Promise<void>((resolve) => e.pty.onExit(() => resolve()));
      e.pty.kill("SIGHUP");
      const timer = this.timers.set(() => e.pty.kill("SIGKILL"), KILL_GRACE_MS);
      await exit;
      this.timers.clear(timer);
    }
    this.entries.delete(id);
  }

  replay(id: string): string {
    return this.get(id).buffer;
  }

  list(): string[] {
    return [...this.entries.keys()];
  }

  private get(id: string): Entry {
    const e = this.entries.get(id);
    if (!e) throw new Error(`no console ${id}`);
    return e;
  }
}
