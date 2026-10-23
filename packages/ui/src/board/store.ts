import { create } from "zustand";
import type { Board, BoardNode, Workspace } from "@agentboard/shared";

type State = {
  board: Board;
  setBoard: (b: Board) => void;
  addNode: (n: BoardNode) => void;
  moveNode: (id: string, x: number, y: number) => void;
  resizeNode: (id: string, w: number, h: number) => void;
  removeNode: (id: string) => void;
  setViewport: (v: Workspace["viewport"]) => void;
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string) => string;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
};

const empty: Board = {
  version: 1,
  repoPath: "",
  activeWorkspaceId: "main",
  workspaces: [{ id: "main", name: "Main", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] }],
};

export const useBoard = create<State>()((set, get) => {
  const editWs = (id: string, f: (w: Workspace) => Workspace) =>
    set(({ board }) => ({ board: { ...board, workspaces: board.workspaces.map((w) => (w.id === id ? f(w) : w)) } }));
  const editActive = (f: (w: Workspace) => Workspace) => editWs(get().board.activeWorkspaceId, f);
  const editNode = (id: string, f: (n: BoardNode) => BoardNode) =>
    editActive((w) => ({ ...w, nodes: w.nodes.map((n) => (n.id === id ? f(n) : n)) }));

  return {
    board: empty,
    setBoard: (board) => set({ board }),
    addNode: (n) => editActive((w) => ({ ...w, nodes: [...w.nodes, n] })),
    moveNode: (id, x, y) => editNode(id, (n) => ({ ...n, x, y })),
    resizeNode: (id, w, h) => editNode(id, (n) => ({ ...n, w, h })),
    removeNode: (id) => editActive((w) => ({ ...w, nodes: w.nodes.filter((n) => n.id !== id) })),
    setViewport: (viewport) => editActive((w) => ({ ...w, viewport })),
    switchWorkspace: (id) =>
      set(({ board }) => (board.workspaces.some((w) => w.id === id) ? { board: { ...board, activeWorkspaceId: id } } : {})),
    createWorkspace: (name) => {
      const id = crypto.randomUUID();
      set(({ board }) => ({
        board: {
          ...board,
          activeWorkspaceId: id,
          workspaces: [...board.workspaces, { id, name, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] }],
        },
      }));
      return id;
    },
    renameWorkspace: (id, name) => editWs(id, (w) => ({ ...w, name })),
    deleteWorkspace: (id) =>
      set(({ board }) => {
        if (board.workspaces.length < 2) return {}; // the last workspace stays
        const workspaces = board.workspaces.filter((w) => w.id !== id);
        const active = board.activeWorkspaceId === id ? workspaces[0]!.id : board.activeWorkspaceId;
        return { board: { ...board, workspaces, activeWorkspaceId: active } };
      }),
  };
});

/** Calls save(board) 500 ms after the last board change; returns the unsubscribe. */
export function autosaveBoard(save: (b: Board) => void, delayMs = 500): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useBoard.subscribe((s, prev) => {
    if (s.board === prev.board) return;
    clearTimeout(timer);
    timer = setTimeout(() => save(useBoard.getState().board), delayMs);
  });
  return () => {
    clearTimeout(timer);
    unsub();
  };
}
