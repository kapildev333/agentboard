import { expect, test } from "vitest";
import { codexLaunch } from "../../src/agents/codex/index.js";

const base = { consoleId: "c1", daemonUrl: "http://127.0.0.1:4000", token: "t0k" };

test("codexLaunch resumes by id when asked", () => {
  const r = codexLaunch({ ...base, sessionId: "s1", resume: true });
  expect(r.command).toBe("codex");
  expect(r.args.slice(0, 2)).toEqual(["resume", "s1"]);
  expect(codexLaunch({ ...base, sessionId: "s1" }).args).not.toContain("resume");
});
