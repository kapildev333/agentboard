import { ConsoleNodeSchema, type ConsoleNode } from "@agentboard/shared";
import { useBoard } from "../board";

type Fetch = typeof globalThis.fetch;

/** The daemon's `{ error }` message from a failed reply, or `fallback` when there is no reply or no message. */
export const errorOf = async (res: Response | null, fallback: string) => {
  const body = (await res?.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : fallback;
};

// Each action resolves to an error message, or undefined when it worked; none rejects.
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
  const reply = ConsoleNodeSchema.safeParse(await res.json().catch(() => null));
  if (!reply.success) return "could not start";
  const fresh = reply.data;
  const placed = { ...fresh, title: node.title, x: node.x, y: node.y, w: node.w, h: node.h };
  const { board, addNode } = useBoard.getState();
  const nodes = board.workspaces.flatMap((w) => w.nodes);
  // The old node may have left the board meanwhile (another tab); then the fresh one, if the daemon's broadcast has not
  // brought it already, simply joins the board.
  if (!nodes.some((n) => n.id === node.id)) {
    if (!nodes.some((n) => n.id === fresh.id)) addNode(placed);
    return undefined;
  }
  // The broadcast may have added the fresh node already; keep one copy, in the old one's slot.
  const workspaces = board.workspaces.map((w) => ({ ...w, nodes: w.nodes.filter((n) => n.id !== fresh.id).map((n) => (n.id === node.id ? placed : n)) }));
  useBoard.setState({ board: { ...board, workspaces } });
  return undefined;
}
