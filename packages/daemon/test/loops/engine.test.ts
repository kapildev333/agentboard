import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { BoardEvent, ConsoleStatus, Loop, LoopRequest } from "@agentboard/shared";
import { LoopEngine } from "../../src/loops/engine.js";

beforeEach(() => void vi.useFakeTimers({ now: new Date(2026, 9, 24, 21, 14) }));
afterEach(() => void vi.useRealTimers());

// One console "c1" whose status the test drives, the way app.ts feeds the tracker's changes in.
function setup(over: Partial<LoopRequest> = {}) {
  let status: ConsoleStatus = "working";
  const writes: string[] = [];
  const events: BoardEvent[] = [];
  const saved: Loop[][] = [];
  const engine = new LoopEngine({
    write: (_id, data) => void writes.push(data),
    status: () => status,
    save: (loops) => void saved.push(structuredClone(loops)),
    event: (e) => void events.push(e),
  });
  const set = (next: ConsoleStatus) => {
    status = next;
    engine.onStatus("c1", next);
  };
  const loop = engine.create({
    consoleId: "c1",
    name: "perf",
    trigger: { kind: "idle", delaySec: 30 },
    stop: { goal: { pattern: "p95 (\\d+)ms", op: "lte", value: 12 } },
    prompt: "Run {run}. Last: {last_output}. Target {goal}.",
    ...over,
  });
  // one run: the console turns idle, the trigger fires, the agent works and prints, then turns idle again
  const run = (output: string) => {
    set("idle");
    vi.advanceTimersByTime(30_000);
    set("working");
    engine.onOutput("c1", output);
    set("idle");
  };
  return { engine, loop, writes, events, saved, set, run };
}

test("an idle loop fires once 30 s after idle and writes the filled prompt", () => {
  const { engine, loop, writes, set } = setup();
  engine.onOutput("c1", "\x1b[32mp95 17ms\x1b[0m\r\nfake> ");
  set("idle");
  vi.advanceTimersByTime(29_999);
  expect(writes).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(writes).toEqual(["Run 1. Last: p95 17ms | fake>. Target p95 <= 12.\r"]);
  vi.advanceTimersByTime(60_000);
  expect(writes).toHaveLength(1);
  expect(engine.get(loop.id)!.runs).toEqual([{ n: 1, startedAt: new Date(2026, 9, 24, 21, 14, 30).toISOString(), outcome: "running", tokens: null }]);
});

test("leaving idle before the delay disarms the idle trigger", () => {
  const { writes, set } = setup();
  set("idle");
  vi.advanceTimersByTime(20_000);
  set("working");
  vi.advanceTimersByTime(60_000);
  expect(writes).toEqual([]);
});

test("a loop does not fire while the console needs you and records the pause reason", () => {
  const { engine, loop, writes, events, set } = setup();
  set("idle");
  set("needs_you");
  vi.advanceTimersByTime(60_000);
  set("idle");
  vi.advanceTimersByTime(60_000);
  expect(writes).toEqual([]);
  expect(engine.get(loop.id)).toMatchObject({ state: "paused", pausedReason: "console needed you at 21:14" });
  expect(events.at(-1)).toMatchObject({ kind: "loop", consoleId: "c1", title: "perf" });
  engine.resume(loop.id);
  expect(engine.get(loop.id)).toMatchObject({ state: "running" });
  expect(engine.get(loop.id)!.pausedReason).toBeUndefined();
  vi.advanceTimersByTime(30_000);
  expect(writes).toHaveLength(1);
});

test("a run ends at the next idle with the goal reading as its outcome", () => {
  const { engine, loop, run } = setup();
  run("bench done\r\np95 14ms\r\n");
  expect(engine.get(loop.id)).toMatchObject({ state: "running", runs: [{ n: 1, outcome: "p95 14ms · goal not met", tokens: null }] });
  expect(engine.get(loop.id)!.runs[0]!.endedAt).toBeDefined();
});

test("the goal p95 11ms against lte 12 retires the loop with goal met", () => {
  const { engine, loop, writes, saved, run } = setup();
  run("p95 14ms\r\n");
  run("p95 11ms\r\n");
  expect(engine.get(loop.id)).toMatchObject({ state: "retired", runs: [{ n: 1 }, { n: 2, outcome: "p95 11ms · goal met" }] });
  expect(writes[1]).toContain("Run 2.");
  vi.advanceTimersByTime(60_000);
  expect(writes).toHaveLength(2);
  expect(saved.at(-1)![0]!.state).toBe("retired");
});

test("maxRuns 2 retires after the second run", () => {
  const { engine, loop, writes, run } = setup({ stop: { maxRuns: 2 } });
  run("one\r\n");
  expect(engine.get(loop.id)!.state).toBe("running");
  run("two\r\n");
  expect(engine.get(loop.id)).toMatchObject({ state: "retired", runs: [{ outcome: "idle" }, { outcome: "idle · max runs" }] });
  vi.advanceTimersByTime(60_000);
  expect(writes).toHaveLength(2);
});

test("a time box retires the loop at the end of the run that passes it", () => {
  const { engine, loop, set } = setup({ stop: { timeBoxMin: 1 } });
  set("idle");
  vi.advanceTimersByTime(30_000);
  set("working");
  vi.advanceTimersByTime(30_000);
  set("idle");
  expect(engine.get(loop.id)).toMatchObject({ state: "retired", runs: [{ outcome: "idle · time box" }] });
});

test("a console exit retires the loop", () => {
  const { engine, loop, set } = setup();
  set("idle");
  vi.advanceTimersByTime(30_000);
  set("exited");
  expect(engine.get(loop.id)).toMatchObject({ state: "retired", runs: [{ outcome: "console exited" }] });
});

test("an output loop fires on a matching line once the console is idle", () => {
  const { engine, writes, set } = setup({ trigger: { kind: "output", pattern: "FAIL" }, prompt: "fix run {run}\nplease" });
  engine.onOutput("c1", "ok 1\r\nFA");
  engine.onOutput("c1", "IL 2\r\n");
  expect(writes).toEqual([]);
  set("idle");
  // a newline in the template would submit early, so the prompt is typed as one line
  expect(writes).toEqual(["fix run 1 please\r"]);
});

test("a schedule loop fires at the next cron minute", () => {
  const { engine, loop, writes, set } = setup({ trigger: { kind: "schedule", cron: "15 21 * * *" } });
  expect(engine.get(loop.id)!.state).toBe("scheduled");
  set("idle");
  vi.advanceTimersByTime(60_000);
  expect(writes).toHaveLength(1);
  set("working");
  set("idle");
  expect(engine.get(loop.id)!.state).toBe("scheduled");
});

test("a schedule tick skips a busy console and never opens a second run", () => {
  const { engine, loop, writes, set } = setup({ trigger: { kind: "schedule", cron: "* * * * *" } });
  vi.advanceTimersByTime(60_000);
  expect(writes).toEqual([]);
  expect(engine.get(loop.id)!.state).toBe("scheduled");
  set("idle");
  vi.advanceTimersByTime(60_000);
  expect(writes).toHaveLength(1);
  expect(() => engine.runNow(loop.id)).toThrow(expect.objectContaining({ status: 409 }));
  vi.advanceTimersByTime(60_000);
  expect(writes).toHaveLength(1);
});

test("a loaded schedule that never runs again retires instead of failing the daemon", () => {
  const loop: Loop = { id: "l1", consoleId: "c1", name: "feb", trigger: { kind: "schedule", cron: "0 0 31 2 *" }, stop: {}, prompt: "go", state: "scheduled", runs: [], createdAt: new Date().toISOString() };
  const engine = new LoopEngine({ write: () => {}, status: () => "idle", save: () => {}, event: () => {} }, [loop]);
  expect(engine.get("l1")!.state).toBe("retired");
});

test("pause, run now and a bad pattern answer with a status", () => {
  const { engine, loop, writes, set } = setup();
  expect(() => engine.runNow(loop.id)).toThrow(expect.objectContaining({ status: 409 }));
  set("idle");
  engine.pause(loop.id);
  vi.advanceTimersByTime(60_000);
  expect(writes).toEqual([]);
  expect(() => engine.runNow(loop.id)).toThrow(expect.objectContaining({ status: 409 }));
  engine.resume(loop.id);
  engine.runNow(loop.id);
  expect(writes).toHaveLength(1);
  expect(() => engine.create({ ...loop, trigger: { kind: "output", pattern: "(" } })).toThrow(expect.objectContaining({ status: 400 }));
  expect(() => engine.create({ ...loop, trigger: { kind: "schedule", cron: "nope" } })).toThrow(expect.objectContaining({ status: 400 }));
  expect(() => engine.create({ ...loop, stop: { goal: { pattern: "p95 \\d+ms", op: "lte", value: 12 } } })).toThrow(expect.objectContaining({ status: 400 }));
  expect(() => engine.pause("missing")).toThrow(expect.objectContaining({ status: 404 }));
  engine.remove(loop.id);
  expect(engine.list()).toEqual([]);
});

test("tokensSince fills a run's tokens at its end", () => {
  const calls: unknown[] = [];
  let status: ConsoleStatus = "idle";
  const engine = new LoopEngine({
    write: () => {},
    status: () => status,
    save: () => {},
    event: () => {},
    tokensSince: (...args) => (calls.push(args), 4200),
  });
  const loop = engine.create({ consoleId: "c1", name: "t", trigger: { kind: "idle", delaySec: 0 }, stop: {}, prompt: "go" });
  engine.runNow(loop.id);
  status = "working";
  engine.onStatus("c1", "working");
  status = "idle";
  engine.onStatus("c1", "idle");
  expect(engine.get(loop.id)!.runs[0]!.tokens).toBe(4200);
  expect(calls[0]).toEqual(["c1", new Date(2026, 9, 24, 21, 14), new Date(2026, 9, 24, 21, 14)]);
});
