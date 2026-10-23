import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { geminiLaunch } from "../../src/agents/gemini/index.js";

const base = { consoleId: "c1", daemonUrl: "http://127.0.0.1:4000", token: "t0k" };

test("geminiLaunch resumes by id when asked", () => {
  const r = geminiLaunch({ ...base, sessionId: "s1", resume: true });
  expect(r.command).toBe("gemini");
  expect(r.args.slice(0, 2)).toEqual(["--resume", "s1"]);
  expect(geminiLaunch({ ...base, sessionId: "s1" }).args).not.toContain("--resume");
});

test("geminiLaunch points a per-launch settings file at the relay", () => {
  const r = geminiLaunch(base);
  const settings = JSON.parse(readFileSync(r.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH!, "utf8"));
  for (const ev of ["BeforeAgent", "AfterAgent", "Notification"]) {
    expect(settings.hooks[ev][0].hooks[0].command).toContain("notify-relay.js");
  }
  expect(r.env.AGENTBOARD_CONSOLE_ID).toBe("c1");
});
