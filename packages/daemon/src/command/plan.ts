import { randomUUID } from "node:crypto";
import type { BoardSnapshot, Plan, PlannedBy, PlanStep, Settings } from "@agentboard/shared";
import { planWithModel } from "./model.js";
import { complete, parseRules, type Draft } from "./rules.js";

const HINT = "I can spawn, close, resume, focus, fit, add a note or type into a console";

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const join = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : (xs[0] ?? ""));

/** One or two sentences for voice: what needs an OK, then what simply runs. */
function reply(steps: PlanStep[]): string {
  const asking = steps.filter((s) => s.asks).map((s) => s.summary.replace(/^Close/, "Closing").replace(/^Type/, "Typing"));
  const safe = steps.filter((s) => !s.asks).map((s) => lowerFirst(s.summary));
  if (!asking.length) return `I will ${join(safe)}.`;
  const ask = `${join(asking)} ${asking.length > 1 ? "need" : "needs"} your OK.`;
  return safe.length ? `${ask} Then I will ${join(safe)}.` : ask;
}

/** D45: the local model first when configured, the rules on any failure or an empty answer. */
export async function planCommand(
  text: string,
  snapshot: BoardSnapshot,
  settings: Settings,
  deps: { fetch?: typeof fetch; now?: () => number } = {},
): Promise<Plan> {
  const now = deps.now ?? (() => performance.now());
  const start = now();
  let steps: PlanStep[] = [];
  let plannedBy: PlannedBy = "rules";
  if (settings.planner) {
    try {
      steps = (await planWithModel(text, snapshot, settings.planner, deps.fetch ?? fetch)).map((s) => complete(s as Draft, snapshot));
      plannedBy = { model: settings.planner.model, url: settings.planner.url };
    } catch {
      steps = [];
    }
  }
  if (!steps.length) {
    steps = parseRules(text, snapshot);
    plannedBy = "rules";
  }
  const ms = Math.max(0, now() - start);
  if (!steps.length) return { id: randomUUID(), text, steps, plannedBy, ms, reply: `Sorry, I did not get that. ${HINT}.`, unknown: HINT };
  return { id: randomUUID(), text, steps, plannedBy, ms, reply: reply(steps) };
}
