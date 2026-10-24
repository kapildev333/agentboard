import type { AgentInfo, Board, BoardSnapshot, ConsoleNode } from "@agentboard/shared";

export function snapshot(board: Board, agents: AgentInfo[], now = Date.now()): BoardSnapshot {
  return {
    repoPath: board.repoPath,
    activeWorkspaceId: board.activeWorkspaceId,
    workspaces: board.workspaces.map((w) => ({ id: w.id, name: w.name })),
    consoles: board.workspaces.flatMap((w) =>
      w.nodes
        .filter((n): n is ConsoleNode => n.type === "console")
        .map((n) => ({
          id: n.id, title: n.title, agent: n.agent, customId: n.customId, status: n.status,
          branch: n.worktree?.branch, cwd: n.cwd, workspaceId: w.id,
          idleSeconds: Math.max(0, Math.floor((now - Date.parse(n.lastActiveAt)) / 1000)) || 0,
        })),
    ),
    agents,
  };
}
