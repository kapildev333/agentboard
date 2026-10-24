import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { HandoffSchema, TeamSchema } from "@agentboard/shared";
import handoffFixture from "../../../shared/src/fixtures/handoff.json" with { type: "json" };
import teamFixture from "../../../shared/src/fixtures/team.json" with { type: "json" };
import { renderPrompt } from "../../src/handoff/render.js";

const expected = readFileSync(new URL("./fixtures/reviewer-prompt.txt", import.meta.url), "utf8").trimEnd();
const team = TeamSchema.parse(teamFixture);
const base = HandoffSchema.parse(handoffFixture);

it("the reviewer prompt matches the fixture text", () => {
  const handoff = { ...base, brief: { ...base.brief, decisions: [], ask: "" } };
  expect(renderPrompt(handoff, team, "Builder", "reviewer", 3)).toBe(expected);
});

it("decisions get their section, and without a team the first line names only the sender", () => {
  const handoff = { ...base, brief: { ...base.brief, ask: "Carry on." }, attachments: { diff: false, teamBrief: true, lastLines: false, files: [] } };
  const text = renderPrompt(handoff, undefined, "Builder", undefined);
  expect(text.split("\n")[0]).toBe("Brief from Builder follows.");
  expect(text).toContain("## Decisions\n- UK rule accepts the GIR 0AA special case\n");
  expect(text).toContain("## Ask\nCarry on.");
  expect(text).not.toContain("[attached");
});
