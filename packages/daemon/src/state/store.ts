import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { BoardSchema, type Board, type BoardNode } from "@agentboard/shared";
import { boardPath } from "./paths.js";

const DEBOUNCE_MS = 300;

const emptyBoard = (repoPath: string, nodes: BoardNode[] = []): Board => ({
  version: 1,
  repoPath,
  activeWorkspaceId: "main",
  workspaces: [{ id: "main", name: "main", viewport: { x: 0, y: 0, zoom: 1 }, nodes }],
});

// Version 0 had no version field and kept nodes directly on the root.
export function migrate(raw: unknown, repoPath = ""): Board {
  const doc = raw as { version?: number; repoPath?: string; nodes?: BoardNode[] };
  if (doc && typeof doc === "object" && doc.version === undefined && Array.isArray(doc.nodes)) {
    return emptyBoard(doc.repoPath ?? repoPath, doc.nodes);
  }
  return raw as Board;
}

export class StateStore {
  // a fresh wrapper per save, so a write in flight is never mistaken for a later save of the same object
  private pending = new Map<string, { board: Board }>();
  private timer: NodeJS.Timeout | null = null;
  private chain: Promise<void> = Promise.resolve();

  async load(repoPath: string): Promise<Board> {
    const pending = this.pending.get(repoPath);
    if (pending) return pending.board;
    const file = boardPath(repoPath);
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      return emptyBoard(repoPath);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error(`invalid board file ${file}: ${(e as Error).message}`, { cause: e });
    }
    const parsed = BoardSchema.safeParse(migrate(raw, repoPath));
    if (!parsed.success) throw new Error(`invalid board file ${file}: ${parsed.error.message}`);
    return parsed.data;
  }

  async save(board: Board): Promise<void> {
    this.pending.set(board.repoPath, { board });
    // not restarted by later saves, so a steady stream of saves still writes every DEBOUNCE_MS
    this.timer ??= setTimeout(() => {
      // the board stays pending on failure; the next save or flush retries it
      this.flush().catch((e) => console.error("agentboard: board write failed:", (e as Error).message));
    }, DEBOUNCE_MS);
  }

  // Writes are serialized on one chain so they share the .tmp name safely and flush() awaits any write in progress.
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const run = this.chain.then(() => this.writePending());
    this.chain = run.catch(() => {});
    return run;
  }

  private async writePending(): Promise<void> {
    for (const [repoPath, entry] of [...this.pending]) {
      const file = boardPath(repoPath);
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(`${file}.tmp`, JSON.stringify(entry.board, null, 2));
      await rename(`${file}.tmp`, file);
      if (this.pending.get(repoPath) === entry) this.pending.delete(repoPath);
    }
  }
}
