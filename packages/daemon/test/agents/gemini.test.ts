import { readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, expect, test } from "vitest";
import { geminiLaunch } from "../../src/agents/gemini/index.js";

const base = { consoleId: "c1", daemonUrl: "http://127.0.0.1:4000", token: "t0k" };
const dirs: string[] = [];
const launch = (extra = {}) => {
  const r = geminiLaunch({ ...base, ...extra });
  dirs.push(dirname(r.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH!));
  return r;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

test("geminiLaunch resumes by id when asked", () => {
  const r = launch({ sessionId: "s1", resume: true });
  expect(r.command).toBe("gemini");
  expect(r.args.slice(0, 2)).toEqual(["--resume", "s1"]);
  expect(launch({ sessionId: "s1" }).args).not.toContain("--resume");
});

test("geminiLaunch points a private defaults file at the relay", () => {
  const r = launch();
  const settings = JSON.parse(readFileSync(r.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH!, "utf8"));
  for (const ev of ["BeforeAgent", "AfterAgent", "Notification"]) {
    const cmd = settings.hooks[ev][0].hooks[0].command as string;
    expect(cmd).toContain("notify-relay.js");
    expect(cmd).toContain(JSON.stringify(process.execPath));
  }
  expect(r.env).not.toHaveProperty("GEMINI_CLI_SYSTEM_SETTINGS_PATH");
  expect(dirname(r.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH!)).toMatch(/agentboard-[A-Za-z0-9]+$/);
  expect(r.env).toMatchObject({ AGENTBOARD_CONSOLE_ID: "c1", AGENTBOARD_AGENT: "gemini" });
});
