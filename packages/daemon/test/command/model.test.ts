import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { BoardSnapshotSchema, PlanSchema, type Settings } from "@agentboard/shared";
import { planCommand } from "../../src/command/plan.js";
import { planWithModel } from "../../src/command/model.js";

const snapshot = BoardSnapshotSchema.parse(
  JSON.parse(readFileSync(new URL("../../../shared/src/fixtures/snapshot.json", import.meta.url), "utf8")),
);
const planner = { url: "http://127.0.0.1:11434", model: "qwen3:4b" };
const withPlanner: Settings = { fontSize: 13, customAgents: [], planner };
const answer = (content: string) =>
  vi.fn<typeof fetch>(async () => Response.json({ message: { role: "assistant", content } }));

test("a fake model's valid steps are used; ids, asks and summaries are regenerated", async () => {
  const fetch = answer(JSON.stringify({ steps: [{ kind: "close", id: "s1", consoleIds: ["c-ci"], asks: false, summary: "x" }, { kind: "fit" }] }));
  const plan = await planCommand("tidy up", snapshot, withPlanner, { fetch: fetch as never });
  expect(PlanSchema.parse(plan)).toEqual(plan);
  expect(plan.plannedBy).toEqual({ model: "qwen3:4b", url: "http://127.0.0.1:11434" });
  expect(plan.steps).toMatchObject([{ kind: "close", consoleIds: ["c-ci"], asks: true, summary: "Close CI cleanup" }, { kind: "fit", asks: false }]);
  expect(plan.steps[0]!.id).not.toBe("s1");
  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe("http://127.0.0.1:11434/api/chat");
  const body = JSON.parse(String(init!.body));
  expect(body).toMatchObject({ model: "qwen3:4b", stream: false, format: "json" });
  expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
  expect(body.messages[0].content).toContain("Lint sweep");
  expect(body.messages[1].content).toBe("tidy up");
  expect(init!.signal).toBeInstanceOf(AbortSignal);
});

test("bad JSON from the model falls back to the rules", async () => {
  const plan = await planCommand("fit all consoles", snapshot, withPlanner, { fetch: answer("not json {") as never });
  expect(plan.plannedBy).toBe("rules");
  expect(plan.steps).toMatchObject([{ kind: "fit" }]);
});

test("an empty or invalid model answer falls back to the rules", async () => {
  for (const content of ['{"steps":[]}', '{"steps":[{"kind":"explode"}]}', '{"steps":[{"kind":"focus","consoleId":"c-nope"}]}']) {
    const plan = await planCommand("fit all", snapshot, withPlanner, { fetch: answer(content) as never });
    expect(plan.plannedBy).toBe("rules");
  }
  const failing = vi.fn(async () => new Response("boom", { status: 500 }));
  expect((await planCommand("fit all", snapshot, withPlanner, { fetch: failing as never })).plannedBy).toBe("rules");
});

test("a planner URL on another host is refused without any fetch", async () => {
  const fetch = answer('{"steps":[{"kind":"fit"}]}');
  for (const url of ["http://192.168.1.20:11434", "https://ollama.example.com", "http://127.0.0.1.nip.io:11434"]) {
    await expect(planWithModel("fit", snapshot, { url, model: "m" }, fetch as never)).rejects.toThrow(/loopback/);
    expect((await planCommand("fit", snapshot, { ...withPlanner, planner: { url, model: "m" } }, { fetch: fetch as never })).plannedBy).toBe("rules");
  }
  expect(fetch).not.toHaveBeenCalled();
  for (const url of ["http://localhost:11434", "http://[::1]:11434/"]) {
    await expect(planWithModel("fit", snapshot, { url, model: "m" }, fetch as never)).resolves.toHaveLength(1);
  }
});

test("the system prompt carries the snapshot but never terminal text", async () => {
  const fetch = answer('{"steps":[{"kind":"fit"}]}');
  await planWithModel("fit", snapshot, planner, fetch as never);
  const system = JSON.parse(String(fetch.mock.calls[0]![1]!.body)).messages[0].content as string;
  for (const s of ["c-checkout", "Checkout flow", "feat/checkout", "needs_you", "spawn", "consoleIds", "main"]) expect(system).toContain(s);
});
