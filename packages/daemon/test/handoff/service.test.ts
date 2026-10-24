import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { HandoffListSchema } from "@agentboard/shared";
import { HandoffService } from "../../src/handoff/service.js";
import { setup } from "./setup.js";

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

it("send to an empty role spawns a console with the prompt and gives it the role", async () => {
  const { service, deps, teams } = setup();
  teams[0]!.roles[1]!.consoleId = null;
  const h = await service.draft({ fromConsoleId: "a" });
  expect(h.target).toEqual({ kind: "spawn", agent: "custom", title: "Reviewer" });
  expect(await service.send(h.id)).toEqual({ consoleId: "new" });
  expect(deps.spawn).toHaveBeenCalledWith({ agent: "custom", prompt: h.promptText, title: "Reviewer", role: "reviewer", fromConsoleId: "a" });
  expect(teams[0]!.roles[1]!.consoleId).toBe("new");
  expect(deps.event).toHaveBeenCalledWith({ kind: "handoff", consoleId: "a", agent: "custom", title: "Builder", detail: "handed off to Reviewer" });
  expect((await service.list("a"))[0]!.sentAt).toBeDefined();
});

it("a stopped target with startStopped is resumed and written once when it settles idle", async () => {
  const { service, deps } = setup({ b: "stopped" });
  deps.resume.mockImplementation(async () => deps.tracker.emit("b", "idle")); // settles before resume returns
  const h = await service.draft({ fromConsoleId: "a" });
  expect(await service.send(h.id, { startStopped: true })).toEqual({ consoleId: "b" });
  expect(deps.resume).toHaveBeenCalledWith("b");
  expect(deps.write.mock.calls).toEqual([["b", h.promptText + "\r"]]);
  expect(deps.tracker.listeners.size).toBe(0);
});

it("a stopped target that settles needs_you is 409 and gets nothing", async () => {
  const { service, deps } = setup({ b: "stopped" });
  deps.resume.mockImplementation(async () => void setTimeout(() => deps.tracker.emit("b", "needs_you"), 5));
  const h = await service.draft({ fromConsoleId: "a" });
  await expect(service.send(h.id, { startStopped: true })).rejects.toMatchObject({ status: 409, message: "Reviewer needs you; a handoff never answers a prompt" });
  expect(deps.write).not.toHaveBeenCalled();
});

it("a stopped target without startStopped is 409 and is not resumed", async () => {
  const { service, deps } = setup({ b: "stopped" });
  const h = await service.draft({ fromConsoleId: "a" });
  await expect(service.send(h.id)).rejects.toMatchObject({ status: 409 });
  expect(deps.resume).not.toHaveBeenCalled();
});

it("a spawned custom agent gets the brief once it settles idle, even when idle comes before spawn returns", async () => {
  const { service, deps, teams } = setup();
  teams[0]!.roles[1]!.consoleId = null;
  deps.spawn.mockImplementation(async () => (deps.tracker.emit("new", "idle"), "new"));
  const h = await service.draft({ fromConsoleId: "a" });
  await service.send(h.id);
  await vi.waitFor(() => expect(deps.write.mock.calls).toEqual([["new", h.promptText + "\r"]]));
  expect(deps.tracker.listeners.size).toBe(0);
});

it("a spawned custom agent that settles needs_you gets nothing", async () => {
  const { service, deps, teams } = setup();
  teams[0]!.roles[1]!.consoleId = null;
  const h = await service.draft({ fromConsoleId: "a" });
  await service.send(h.id);
  deps.tracker.emit("new", "needs_you");
  await vi.waitFor(() => expect(deps.tracker.listeners.size).toBe(0));
  expect(deps.write).not.toHaveBeenCalled();
});

it("after a restart, update still counts the diff's files", async () => {
  const first = setup();
  first.deps.diff.mockResolvedValue({ files: [{}, {}], patch: "+a\n-b\n" });
  const h = await first.service.draft({ fromConsoleId: "a" });
  expect(h.promptText).toContain("diff (2 files)");
  const again = new HandoffService(first.deps);
  const edited = await again.update(h.id, { ...h, brief: { ...h.brief, ask: "Check the copy." } });
  expect(edited.promptText).toContain("diff (2 files)");
  expect(edited.promptText).toContain("## Ask\nCheck the copy.");
});

it("scrub leaves a longer name that starts with the home alone", async () => {
  const { service, deps } = setup();
  deps.replay = () => "I decided to read /home/someone2/x and /home/someone/y.\r\n";
  const h = await service.draft({ fromConsoleId: "a" });
  expect(h.brief.decisions).toEqual(["I decided to read /home/someone2/x and ~/y."]);
});
