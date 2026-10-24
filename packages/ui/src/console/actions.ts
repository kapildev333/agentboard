import { ConsoleNodeSchema, type ConsoleNode } from "@agentboard/shared";
import { useBoard } from "../board";

type Fetch = typeof globalThis.fetch;
// Each action resolves to the daemon's error message, or undefined when it worked.
const errorOf = async (res: Response | null, fallback: string) =>
  ((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? fallback;

export async function resumeConsole(fetch: Fetch, id: string) {
  const res = await fetch(`/api/consoles/${encodeURIComponent(id)}/resume`, { method: "POST" }).catch(() => null);
  return res?.ok ? undefined : errorOf(res, "could not resume");
}

/**
 * Spawns a console with the same agent and cwd and puts it in this one's place; dropping this one from the board
 * ends it (App's DELETE). A worktree console starts in the same worktree path, but the spawn request can only make
 * a new worktree, so the fresh node carries no worktree field.
 */
export async function startFresh(fetch: Fetch, node: ConsoleNode) {
  const body = { agent: node.agent, cwd: node.cwd, ...(node.customId && { customId: node.customId }) };
  const res = await fetch("/api/consoles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res?.ok) return errorOf(res, "could not start");
  const fresh = ConsoleNodeSchema.parse(await res.json());
  const placed = { ...fresh, title: node.title, x: node.x, y: node.y, w: node.w, h: node.h };
  const { board } = useBoard.getState();
  // The daemon's board broadcast may have added the fresh node already; keep one copy, in the old one's slot.
  const workspaces = board.workspaces.map((w) => ({ ...w, nodes: w.nodes.filter((n) => n.id !== fresh.id).map((n) => (n.id === node.id ? placed : n)) }));
  useBoard.setState({ board: { ...board, workspaces } });
  return undefined;
}
