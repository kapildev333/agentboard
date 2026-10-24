import { expect, it } from "vitest";
import { extractBrief } from "../../src/handoff/extract.js";
import type { Turn } from "../../src/handoff/transcript.js";

const turns: Turn[] = [
  { role: "user", text: "Add postal validation for CA, UK and NL." },
  { role: "assistant", text: "I decided to keep the rules in one table. Starting with the validator." },
  { role: "tool", text: "", tool: { name: "Edit", files: ["src/lib/postal.ts"] } },
  { role: "tool", text: "The file src/lib/postal.ts has been updated." },
  { role: "tool", text: "npm test -- postal", tool: { name: "Bash" } },
  { role: "tool", text: "RUN v3\n Test Files  1 passed (1)\n      Tests  18 passed (18)\n" },
  { role: "assistant", text: "Validator and tests are in.\n\n## What's left\n- Copy review on the error text\n- Normalise spacing before validating?\n\nThat's all for now." },
];

it("a transcript with one edit, one test run and a what's-left list gives two done and two left items", () => {
  const brief = extractBrief(turns, null);
  expect(brief.done).toEqual(["Edited src/lib/postal.ts", "Ran npm test -- postal: Tests 18 passed (18)"]);
  expect(brief.left).toEqual(["Copy review on the error text", "Normalise spacing before validating?"]);
  expect(brief.decisions).toEqual(["I decided to keep the rules in one table."]);
  expect(brief.ask).toBe("");
});
