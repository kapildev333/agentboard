import { expect, it, vi } from "vitest";
import type { ConsoleStatus } from "@agentboard/shared";
import { TeamTriggers } from "../../src/handoff/triggers.js";
import { setup } from "./setup.js";

// A tracker whose status changes the test emits by hand.
function tracker(status: Record<string, ConsoleStatus>) {
  const listeners: ((id: string, s: ConsoleStatus, previous: ConsoleStatus) => void)[] = [];
  return {
    get: (id: string) => status[id] ?? "idle",
    onChange: (cb: (typeof listeners)[number]) => (listeners.push(cb), () => {}),
    emit: (id: string, s: ConsoleStatus, previous: ConsoleStatus) => {
      status[id] = s;
      listeners.forEach((cb) => cb(id, s, previous));
    },
  };
}

it("an idle planner with handoffOnIdle briefs the idle builder once", async () => {
  const status: Record<string, ConsoleStatus> = { a: "working", b: "idle" };
  const { deps, service, teams } = setup(status, { handoffOnIdle: true });
  teams[0]!.roles = [{ name: "planner", consoleId: "a", order: 1 }, { name: "builder", consoleId: "b", order: 2 }];
  const t = tracker(status);
  new TeamTriggers({ tracker: t, console: deps.console, service });
  t.emit("a", "idle", "working");
  t.emit("a", "idle", "idle");
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
    t.emit("a", "idle", "working");
    await new Promise((r) => setTimeout(r, 50));
    expect(deps.write).not.toHaveBeenCalled();
  }
});
