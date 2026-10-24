import { stepAsks, type ConsoleNode, type Plan, type PlanStep, type RunResponse } from "@agentboard/shared";

export type RunDeps = {
  spawn(step: Extract<PlanStep, { kind: "spawn" }>): Promise<ConsoleNode>;
  close(id: string): Promise<void>;
  resume(id: string): Promise<ConsoleNode>;
  note(text: string): Promise<void>;
  input(id: string, text: string): Promise<void>;
};

/** P5-D48: an asking step runs only when confirmed, is skipped when skipped, else the whole request is refused. */
export async function runPlan(plan: Plan, confirmed: string[], skipped: string[], deps: RunDeps): Promise<RunResponse> {
  for (const s of plan.steps)
    if ((s.asks || stepAsks(s.kind)) && !confirmed.includes(s.id) && !skipped.includes(s.id))
      throw Object.assign(new Error(`step ${s.id} (${s.summary}) needs confirmation`), { status: 409 });
  const out: RunResponse = { results: [] };
  let spawned: string | undefined; // focus: the last focus step wins over the last spawn
  let focused: string | undefined;
  for (const s of plan.steps) {
    if (skipped.includes(s.id)) {
      out.results.push({ stepId: s.id, status: "skipped" });
      continue;
    }
    try {
      let consoleId: string | undefined;
      if (s.kind === "spawn") spawned = consoleId = (await deps.spawn(s)).id;
      else if (s.kind === "close") for (const id of s.consoleIds) await deps.close(id);
      else if (s.kind === "resume") consoleId = (await deps.resume(s.consoleId)).id;
      else if (s.kind === "note") await deps.note(s.text);
      else if (s.kind === "input") await deps.input(s.consoleId, s.text);
      else if (s.kind === "focus") focused = s.consoleId;
      else out.fit = true;
      out.results.push({ stepId: s.id, status: "done", ...(consoleId && { consoleId }) });
    } catch (e) {
      out.results.push({ stepId: s.id, status: "failed", error: (e as Error).message });
    }
  }
  if (focused ?? spawned) out.focus = focused ?? spawned;
  return out;
}
