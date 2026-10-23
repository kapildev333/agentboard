import { expect, test } from "vitest";
import { codexLaunch } from "../../src/agents/codex/index.js";

const base = { consoleId: "c1", daemonUrl: "http://127.0.0.1:4000", token: "t0k" };

test("codexLaunch resumes by id when asked", () => {
  const r = codexLaunch({ ...base, sessionId: "s1", resume: true });
  expect(r.command).toBe("codex");
  expect(r.args.slice(0, 2)).toEqual(["resume", "s1"]);
  expect(codexLaunch({ ...base, sessionId: "s1" }).args).not.toContain("resume");
});

test("codexLaunch passes notify via -c and the hook target via env", () => {
  const r = codexLaunch(base);
  expect(r.args[0]).toBe("-c");
  expect(JSON.parse(r.args[1]!.slice("notify=".length))).toEqual([process.execPath, expect.stringMatching(/notify-relay\.js$/)]);
  expect(r.env).toMatchObject({ AGENTBOARD_URL: base.daemonUrl, AGENTBOARD_CONSOLE_ID: "c1", AGENTBOARD_TOKEN: "t0k", AGENTBOARD_AGENT: "codex" });
});
