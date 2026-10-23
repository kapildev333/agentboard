import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import * as shared from "@agentboard/shared";
import { DaemonInfoSchema, routes, type SchemaName } from "@agentboard/shared";

type Route = (typeof routes)[number];
type Env = Record<string, string | undefined>;

export function readDaemonInfo(env: Env = process.env) {
  const home = env.AGENTBOARD_HOME ?? join(homedir(), ".agentboard");
  return DaemonInfoSchema.parse(JSON.parse(readFileSync(join(home, "daemon.json"), "utf8")));
}

const schema = (name: SchemaName) => shared[name] as unknown as z.ZodType;

export class DaemonClient {
  // ponytail: addNote targets the last opened repo, else cwd; a board-scoped note route would remove the read-modify-write race
  private repo: string | undefined;

  constructor(
    private info: z.infer<typeof DaemonInfoSchema>,
    private fetchFn: typeof fetch = fetch,
    private env: Env = process.env,
  ) {}

  private async call(method: Route["method"], path: Route["path"], input?: unknown): Promise<unknown> {
    const route = routes.find((r) => r.method === method && r.path === path)!;
    const url = new URL(`http://127.0.0.1:${this.info.port}${path}`);
    const headers: Record<string, string> = { "x-agentboard-token": this.info.token };
    let body: string | undefined;
    if (route.request) {
      const parsed = schema(route.request).parse(input);
      if (method === "GET") for (const [k, v] of Object.entries(parsed as object)) url.searchParams.set(k, String(v));
      else {
        body = JSON.stringify(parsed);
        headers["content-type"] = "application/json";
      }
    }
    const res = await this.fetchFn(url.toString(), { method, headers, body });
    if (!res.ok) throw new Error(`daemon ${method} ${path} failed: ${res.status} ${await res.text()}`);
    return schema(route.response).parse(await res.json());
  }

  openBoard(repoPath: string) {
    this.repo = repoPath;
    return this.call("GET", "/api/board", { repo: repoPath }) as Promise<z.infer<typeof shared.BoardSchema>>;
  }

  spawnConsole(req: { agent: string; cwd: string; worktree?: string; prompt?: string; callerConsoleId?: string }) {
    const callerConsoleId = req.callerConsoleId ?? this.env.AGENTBOARD_CONSOLE_ID;
    return this.call("POST", "/api/consoles", {
      ...req,
      ...(callerConsoleId ? { callerConsoleId } : {}),
    }) as Promise<z.infer<typeof shared.ConsoleNodeSchema>>;
  }

  getStatus() {
    return this.call("GET", "/api/status") as Promise<z.infer<typeof shared.StatusResponseSchema>>;
  }

  async listConsoles() {
    return (await this.getStatus()).consoles;
  }

  // No note route exists in the shared table, so this edits the board through GET and PUT /api/board.
  async addNote({ text }: { text: string }) {
    const board = await this.openBoard(this.repo ?? process.cwd());
    const ws = board.workspaces.find((w) => w.id === board.activeWorkspaceId) ?? board.workspaces[0];
    if (!ws) throw new Error("board has no workspace");
    const note = {
      id: `note-${Date.now().toString(36)}`,
      type: "note" as const,
      title: "Note",
      x: 0, y: 0, w: 280, h: 200,
      text,
    };
    ws.nodes.push(note);
    await this.call("PUT", "/api/board", board);
    return note;
  }
}
