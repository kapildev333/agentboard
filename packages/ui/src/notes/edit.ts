import { useEffect, useRef, useState } from "react";
import type { BoardNode } from "@agentboard/shared";
import { useBoard } from "../board";

/** Changes one node of the active workspace through the store, so autosave and the rev flow carry it. */
export const patchNode = (id: string, f: (n: BoardNode) => BoardNode) =>
  useBoard.setState(({ board }) => ({
    board: {
      ...board,
      workspaces: board.workspaces.map((w) => (w.id === board.activeWorkspaceId ? { ...w, nodes: w.nodes.map((n) => (n.id === id ? f(n) : n)) } : w)),
    },
  }));

/** A local copy of `value` that `save` receives 300 ms after the last change and on blur. */
export function useDraft(value: string, save: (v: string) => void) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ draft, save });
  latest.current = { draft, save };
  const flush = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    latest.current.save(latest.current.draft);
  };
  // What the store holds wins (the daemon pushed a change) unless this view has an edit still pending.
  useEffect(() => {
    if (!timer.current) setDraft(value);
  }, [value]);
  // A pending edit is saved when the view goes away (Done, node removed).
  useEffect(() => () => timer.current && flush(), []);
  return {
    value: draft,
    onChange: (e: { target: { value: string } }) => {
      const v = e.target.value;
      setDraft(v);
      latest.current = { draft: v, save };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 300);
    },
    onBlur: flush,
  };
}
