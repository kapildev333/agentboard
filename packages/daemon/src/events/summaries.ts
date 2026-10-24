import type { Board, ConsoleNode, ConsoleSummary } from "@agentboard/shared";

const MAX = 200;
// CSI sequences, OSC sequences ending in BEL or ST, and two-character escapes.
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/** The last non-empty output line per console, plus its loop, for the Mission Map tiles. */
export class ConsoleSummaries {
  private lines = new Map<string, string>();
  private loops = new Map<string, string>();

  feed(consoleId: string, data: string): void {
    // A line cut across chunks is not rejoined: the tile shows the newest complete-enough text.
    const last = data.replace(ANSI, "").replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).at(-1);
    if (last) this.lines.set(consoleId, last.slice(0, MAX));
  }

  setLoop(consoleId: string, loopId: string | undefined): void {
    if (loopId) this.loops.set(consoleId, loopId);
    else this.loops.delete(consoleId);
  }

  summarise(board: Board): ConsoleSummary[] {
    const teams = board.workspaces.flatMap((w) => w.teams ?? []);
    return board.workspaces
      .flatMap((w) => w.nodes)
      .filter((n): n is ConsoleNode => n.type === "console")
      .map((n) => {
        const team = teams.find((t) => t.roles.some((r) => r.consoleId === n.id));
        return {
          ...n,
          lastLine: this.lines.get(n.id) ?? "",
          teamId: team?.id,
          role: team?.roles.find((r) => r.consoleId === n.id)?.name,
          loopId: this.loops.get(n.id),
          repoPath: board.repoPath,
        };
      });
  }
}
