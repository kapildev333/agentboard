import type { PlanStepKind } from "./types.js";

/** D48: closing consoles and typing into a running one always ask; every other kind is safe. */
export const stepAsks = (kind: PlanStepKind): boolean => kind === "close" || kind === "input";
