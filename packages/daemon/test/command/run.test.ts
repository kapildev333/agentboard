import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { PlanSchema, type ConsoleNode, type Plan } from "@agentboard/shared";
import { runPlan } from "../../src/command/run.js";

const plan = PlanSchema.parse(JSON.parse(readFileSync(new URL("../../../shared/src/fixtures/plan.json", import.meta.url), "utf8")));
const node = (id: string) => ({ id }) as ConsoleNode;
const fakeDeps = () => ({
  spawn: vi.fn(async () => node("new")),
  close: vi.fn<(id: string) => Promise<void>>(async () => {}),
  resume: vi.fn(async (id: string) => node(id)),
  note: vi.fn(async () => {}),
  input: vi.fn(async () => {}),
});

test("a close step runs only when confirmed and is refused when neither confirmed nor skipped", async () => {
  const refused = fakeDeps();
  await expect(runPlan(plan, [], [], refused)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("s1") });
  for (const f of Object.values(refused)) expect(f).not.toHaveBeenCalled();

  const ok = fakeDeps();
  const res = await runPlan(plan, ["s1"], [], ok);
  expect(ok.close.mock.calls.map((c) => c[0])).toEqual(["c-ci", "c-lint"]);
  expect(ok.resume).toHaveBeenCalledWith("c-docs");
  expect(res.results.map((r) => r.status)).toEqual(["done", "done"]);

  const skip = fakeDeps();
  const sk = await runPlan(plan, [], ["s1"], skip);
  expect(skip.close).not.toHaveBeenCalled();
  expect(skip.resume).toHaveBeenCalledWith("c-docs");
  expect(sk.results).toMatchObject([{ stepId: "s1", status: "skipped" }, { stepId: "s2", status: "done" }]);
});

test("a failing step is reported and the run continues", async () => {
  const deps = fakeDeps();
  deps.close.mockRejectedValueOnce(new Error("boom"));
  const res = await runPlan(plan, ["s1"], [], deps);
  expect(res.results[0]).toMatchObject({ stepId: "s1", status: "failed", error: "boom" });
  expect(res.results[1]).toMatchObject({ stepId: "s2", status: "done" });
});

test("focus and fit are reported", async () => {
  const p: Plan = {
    ...plan,
    steps: [
      { id: "a", kind: "spawn", agent: "claude", summary: "Spawn", asks: false },
      { id: "b", kind: "fit", summary: "Fit", asks: false },
      { id: "c", kind: "focus", consoleId: "c-x", summary: "Focus", asks: false },
      { id: "d", kind: "note", text: "hi", summary: "Note", asks: false },
      { id: "e", kind: "input", consoleId: "c-x", text: "yes", summary: "Type", asks: true },
    ],
  };
  const deps = fakeDeps();
  const res = await runPlan(p, ["e"], [], deps);
  expect(res).toMatchObject({ focus: "c-x", fit: true });
  expect(res.results[0]).toMatchObject({ status: "done", consoleId: "new" });
  expect(deps.note).toHaveBeenCalledWith("hi");
  expect(deps.input).toHaveBeenCalledWith("c-x", "yes");
  const spawnOnly = await runPlan({ ...p, steps: [p.steps[0]!] }, [], [], fakeDeps());
  expect(spawnOnly).toMatchObject({ focus: "new" });
  expect(spawnOnly.fit).toBeUndefined();
});
