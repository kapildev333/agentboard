import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, vi } from "vitest";
import type { ConsoleNode, ConsoleStatus, Team } from "@agentboard/shared";
import { HandoffService } from "../../src/handoff/service.js";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const node = (id: string, title: string): ConsoleNode => ({
  id, type: "console", title, x: 0, y: 0, w: 1, h: 1, agent: "custom", cwd: "/work/shop", status: "idle", createdAt: "", lastActiveAt: "",
});
const team = (): Team => ({
  id: "t1", name: "checkout", brief: "Ship postal validation.", collapsed: false,
  roles: [{ name: "builder", consoleId: "a", order: 1 }, { name: "reviewer", consoleId: "b", order: 2 }],
  triggers: { handoffOnIdle: false, includeDiff: false, startStopped: false },
});

// A tracker whose status changes the test emits by hand.
export function tracker(status: Record<string, ConsoleStatus>) {
  const listeners = new Set<(id: string, s: ConsoleStatus, previous: ConsoleStatus) => void>();
  return {
    get: (id: string) => status[id] ?? "idle",
    onChange: (cb: (id: string, s: ConsoleStatus, previous: ConsoleStatus) => void) => (listeners.add(cb), () => void listeners.delete(cb)),
    emit: (id: string, s: ConsoleStatus) => {
      const previous = status[id] ?? "idle";
      status[id] = s;
      listeners.forEach((cb) => cb(id, s, previous));
    },
    listeners,
  };
}

// A home under tmp, two consoles in one team, and a ring buffer that mentions the user's home.
export function setup(status: Record<string, ConsoleStatus> = {}, triggers: Partial<Team["triggers"]> = {}) {
  const home = mkdtempSync(join(tmpdir(), "agentboard-handoff-"));
  dirs.push(home);
  const teams = [{ ...team(), triggers: { ...team().triggers, ...triggers } }];
  const nodes = { a: node("a", "Builder"), b: node("b", "Reviewer") };
  const deps = {
    home: () => home,
    userHome: "/home/someone",
    console: (id: string) => (id in nodes ? { node: nodes[id as "a" | "b"], teams } : undefined),
    tracker: tracker(status),
    replay: () => "I decided to keep /home/someone/notes.md as it is.\r\nWhat's left:\r\n- tidy up\r\n",
    write: vi.fn(),
    diff: vi.fn(async (): Promise<{ files: unknown[]; patch: string }> => ({ files: [], patch: "" })),
    spawn: vi.fn(async (): Promise<string> => "new"),
    resume: vi.fn(async (): Promise<void> => {}),
    event: vi.fn(),
  };
  return { home, deps, teams, nodes, service: new HandoffService(deps) };
}
