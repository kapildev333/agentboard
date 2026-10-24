import type { BoardSnapshot, PlanStep, PlanStepKind } from "./types.js";

/** D48: closing consoles and typing into a running one always ask; every other kind is safe. */
export const stepAsks = (kind: PlanStepKind): boolean => kind === "close" || kind === "input";

/** The one line the UI shows for a step. Console ids are looked up in the snapshot; an unknown id prints as itself. */
export function summarise(step: PlanStep, snapshot: BoardSnapshot): string {
  const title = (id: string) => snapshot.consoles.find((c) => c.id === id)?.title ?? id;
  switch (step.kind) {
    case "spawn":
      return `Spawn ${step.agent}${step.worktree ? ` in worktree ${step.worktree}` : ""}`;
    case "close": {
      const titles = step.consoleIds.map(title);
      return `Close ${titles.length > 1 ? `${titles.slice(0, -1).join(", ")} and ${titles.at(-1)}` : titles[0]}`;
    }
    case "resume":
      return `Resume ${title(step.consoleId)}`;
    case "focus":
      return `Focus ${title(step.consoleId)}`;
    case "fit":
      return "Fit all consoles";
    case "note":
      return "Add a note";
    case "input":
      return `Type into ${title(step.consoleId)}`;
  }
}
