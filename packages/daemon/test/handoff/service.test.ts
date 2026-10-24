import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { HandoffListSchema, type ConsoleNode, type ConsoleStatus, type Team } from "@agentboard/shared";
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

// A home under tmp, two consoles in one team, and a ring buffer that mentions the user's home.
export function setup(status: Record<string, ConsoleStatus> = {}) {
  const home = mkdtempSync(join(tmpdir(), "agentboard-handoff-"));
  dirs.push(home);
  const teams = [team()];
  const nodes = { a: node("a", "Builder"), b: node("b", "Reviewer") };
  const deps = {
    home: () => home,
    userHome: "/home/someone",
    console: (id: string) => (id in nodes ? { node: nodes[id as "a" | "b"], teams } : undefined),
    tracker: { get: (id: string) => status[id] ?? "idle", onChange: () => () => {} },
    replay: () => "Edited /home/someone/notes.md\r\nWhat's left:\r\n- tidy up\r\n",
    write: vi.fn(),
    diff: vi.fn(async () => ({ files: [], patch: "" })),
    spawn: vi.fn(async () => "new"),
    resume: vi.fn(async () => {}),
    event: vi.fn(),
  };
  return { home, deps, teams, service: new HandoffService(deps) };
}

it("send to a needs_you console is 409 and writes nothing", async () => {
  const { service, deps } = setup({ b: "needs_you" });
  const h = await service.draft({ fromConsoleId: "a" });
  expect(h.target).toEqual({ kind: "console", consoleId: "b" });
  await expect(service.send(h.id)).rejects.toMatchObject({ status: 409, message: "Reviewer needs you; a handoff never answers a prompt" });
  expect(deps.write).not.toHaveBeenCalled();
  expect(deps.event).not.toHaveBeenCalled();
});

it("draft saves markdown without a home path", async () => {
  const { service, home } = setup();
  const h = await service.draft({ fromConsoleId: "a" });
  const md = readFileSync(join(home, "handoffs", `${h.id}.md`), "utf8");
  expect(md).toBe(h.promptText);
  expect(md).toContain("~/notes.md");
  expect(md).not.toContain("/home/someone");
  expect(HandoffListSchema.parse(JSON.parse(readFileSync(join(home, "handoffs.json"), "utf8")))).toEqual([h]);
});
