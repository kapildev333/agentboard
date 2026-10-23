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

type Entry = { pty: IPty; exited: boolean };

export class PtyManager {
  private entries = new Map<string, Entry>();

  spawn(o: SpawnOptions): PtyHandle {
    const pty = ptySpawn(o.command, o.args, { name: "xterm-256color", cwd: o.cwd, env: o.env, cols: o.cols, rows: o.rows });
    this.entries.set(o.id, { pty, exited: false });
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

  async kill(id: string): Promise<void> {
    this.get(id).pty.kill("SIGHUP");
  }

  private get(id: string): Entry {
    const e = this.entries.get(id);
    if (!e) throw new Error(`no console ${id}`);
    return e;
  }
}
