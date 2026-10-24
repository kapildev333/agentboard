import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { HandoffListSchema } from "@agentboard/shared";
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
