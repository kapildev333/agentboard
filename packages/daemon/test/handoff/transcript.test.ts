import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import type { ConsoleNode } from "@agentboard/shared";
import { readTranscript } from "../../src/handoff/transcript.js";

const home = fileURLToPath(new URL("./fixtures/home", import.meta.url));
const node = (over: Partial<ConsoleNode>): ConsoleNode => ({
  id: "c1", type: "console", title: "Builder", x: 0, y: 0, w: 1, h: 1, agent: "claude", cwd: "/work/shop",
  status: "idle", createdAt: "", lastActiveAt: "", ...over,
});

it("the claude reader maps tool_use Edit to an edited file", async () => {
  const turns = await readTranscript(node({ session: { provider: "claude", id: "sess-1" } }), { home, replay: () => "" });
  expect(turns).toEqual([
    { role: "user", text: "Add postal validation for CA, UK and NL." },
    { role: "assistant", text: "I chose one rules table per country." },
    { role: "tool", text: "", tool: { name: "Edit", files: ["src/lib/postal.ts"] } },
    { role: "tool", text: "The file has been updated." },
    { role: "tool", text: "npm test", tool: { name: "Bash" } },
    { role: "tool", text: "Tests  18 passed (18)" },
    { role: "assistant", text: "What's left:\n- Copy review" },
  ]);
});
