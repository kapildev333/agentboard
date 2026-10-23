import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { BoardSchema, type Board } from "@agentboard/shared";
import { boardPath } from "./paths.js";

const DEBOUNCE_MS = 300;

export function migrate(raw: unknown): Board {
  return raw as Board;
}

export class StateStore {
  private pending: Board | null = null;
  private timer: NodeJS.Timeout | null = null;

  async load(repoPath: string): Promise<Board> {
    let text: string;
    try {
      text = await readFile(boardPath(repoPath), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      return {
        version: 1,
        repoPath,
        activeWorkspaceId: "main",
        workspaces: [{ id: "main", name: "main", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] }],
      };
    }
    return BoardSchema.parse(migrate(JSON.parse(text)));
  }

  async save(board: Board): Promise<void> {
    this.pending = board;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const board = this.pending;
    if (!board) return;
    this.pending = null;
    const file = boardPath(board.repoPath);
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(`${file}.tmp`, JSON.stringify(board, null, 2));
    await rename(`${file}.tmp`, file);
  }
}
