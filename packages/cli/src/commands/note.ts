import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { BoardSchema, type NoteNode } from "@agentboard/shared";
import { api } from "../api.js";
import { ensureDaemon } from "../daemonFile.js";

// Boards are keyed by the exact repo path, so default to the main repo root, not a subdirectory or linked worktree.
function mainRepoRoot(cwd: string): string {
  try {
    const out = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const [common = "", top = ""] = out.trim().split("\n");
    // A submodule's common dir lives under the parent's .git/modules, so its own top level is the root.
    return basename(common) === ".git" ? dirname(common) : top;
  } catch {
    return cwd; // not a git repo
  }
}

// ponytail: read-modify-write of the whole board; a concurrent UI edit can be lost until a notes route exists.
export async function noteCommand(args: string[], deps: { log?: (line: string) => void; cwd?: string } = {}): Promise<number> {
  const log = deps.log ?? console.log;
  try {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { repo: { type: "string" } } });
    const text = positionals.join(" ");
    if (!text) throw new Error("usage: agentboard note <text> [--repo <path>]");
    const repo = resolve(values.repo ?? mainRepoRoot(deps.cwd ?? process.cwd()));
    const info = await ensureDaemon(repo);
    const board = BoardSchema.parse(await api(info, "GET", `/api/board?repo=${encodeURIComponent(repo)}`));
    const ws = board.workspaces.find((w) => w.id === board.activeWorkspaceId);
    if (!ws) throw new Error("board has no active workspace");
    const note: NoteNode = {
      id: randomUUID(),
      type: "note",
      title: "note",
      text,
      x: ws.nodes.length ? Math.min(...ws.nodes.map((n) => n.x)) : 0,
      y: ws.nodes.length ? Math.max(...ws.nodes.map((n) => n.y + n.h)) + 40 : 0,
      w: 240,
      h: 160,
    };
    ws.nodes.push(note);
    await api(info, "PUT", "/api/board", board);
    log(JSON.stringify({ id: note.id }));
    return 0;
  } catch (e) {
    log(JSON.stringify({ error: (e as Error).message }));
    return 1;
  }
}
