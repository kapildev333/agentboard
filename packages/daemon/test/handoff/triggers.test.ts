import { expect, it, vi } from "vitest";
import type { ConsoleStatus } from "@agentboard/shared";
import { TeamTriggers } from "../../src/handoff/triggers.js";
import { setup, tracker } from "./setup.js";

it("an idle planner with handoffOnIdle briefs the idle builder once", async () => {
  const status: Record<string, ConsoleStatus> = { a: "working", b: "idle" };
  const { deps, service, teams } = setup(status, { handoffOnIdle: true });
  teams[0]!.roles = [{ name: "planner", consoleId: "a", order: 1 }, { name: "builder", consoleId: "b", order: 2 }];
  const t = tracker(status);
  new TeamTriggers({ tracker: t, console: deps.console, service });
  t.emit("a", "idle");
  t.emit("a", "idle");
  await vi.waitFor(() => expect(deps.write).toHaveBeenCalledTimes(1));
  expect(deps.write.mock.calls[0]).toEqual(["b", expect.stringMatching(/^You are the builder on team "checkout"\. Brief from Builder follows\.\n[\s\S]*\r$/)]);
  await new Promise((r) => setTimeout(r, 50));
  expect(deps.write).toHaveBeenCalledTimes(1);
});

it("a builder that needs you, or a team without handoffOnIdle, gets nothing", async () => {
  for (const [b, handoffOnIdle] of [["needs_you", true], ["idle", false]] as const) {
    const status: Record<string, ConsoleStatus> = { a: "working", b };
    const { deps, service } = setup(status, { handoffOnIdle });
    const t = tracker(status);
    new TeamTriggers({ tracker: t, console: deps.console, service });
    t.emit("a", "idle");
    await new Promise((r) => setTimeout(r, 50));
    expect(deps.write).not.toHaveBeenCalled();
  }
});

it("a stopped builder with startStopped is resumed and briefed once it settles idle; without it, left alone", async () => {
  for (const startStopped of [true, false]) {
    const status: Record<string, ConsoleStatus> = { a: "working", b: "stopped" };
    const { deps, service } = setup(status, { handoffOnIdle: true, startStopped });
    deps.resume.mockImplementation(async () => void setTimeout(() => deps.tracker.emit("b", "idle"), 5));
    new TeamTriggers({ tracker: deps.tracker, console: deps.console, service });
    deps.tracker.emit("a", "idle");
    await new Promise((r) => setTimeout(r, 100));
    expect(deps.resume).toHaveBeenCalledTimes(startStopped ? 1 : 0);
    expect(deps.write.mock.calls.map((c) => c[0])).toEqual(startStopped ? ["b"] : []);
  }
});
