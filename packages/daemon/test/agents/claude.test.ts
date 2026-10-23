import { expect, test } from "vitest";
import { CLAUDE_HOOK_EVENTS, claudeLaunch } from "../../src/agents/claude/index.js";
import { relayPath } from "../../src/agents/codex/index.js";

const base = {
  consoleId: "c1",
  sessionId: "8f0e2a52-4c1b-4b0e-9f3a-2d7c1e5b6a90",
  daemonUrl: "http://127.0.0.1:4321",
  token: "t0k",
  name: "api worker",
};

const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

test("claudeLaunch passes a session id and six command hooks that run the relay", () => {
  const { command, args } = claudeLaunch(base);
  expect(command).toBe("claude");
  expect(after(args, "--session-id")).toBe(base.sessionId);
  expect(after(args, "--name")).toBe(base.name);
  const settings = JSON.parse(after(args, "--settings"));
  expect(Object.keys(settings.hooks).sort()).toEqual(
    ["Notification", "PermissionRequest", "PreToolUse", "SessionEnd", "Stop", "UserPromptSubmit"],
  );
  expect([...CLAUDE_HOOK_EVENTS].sort()).toEqual(Object.keys(settings.hooks).sort());
  for (const event of CLAUDE_HOOK_EVENTS) {
    const hook = settings.hooks[event][0].hooks[0];
    expect(hook.type).toBe("command");
    expect(hook.command).toBe(`${JSON.stringify(process.execPath)} ${JSON.stringify(relayPath)}`);
  }
});

test("claudeLaunch keeps the token out of argv and puts it in the environment", () => {
  const { args, env } = claudeLaunch(base);
  expect(args.join(" ")).not.toContain(base.token);
  expect(env).toEqual({
    AGENTBOARD_URL: base.daemonUrl,
    AGENTBOARD_CONSOLE_ID: "c1",
    AGENTBOARD_TOKEN: base.token,
    AGENTBOARD_AGENT: "claude",
  });
});

test("claudeLaunch with resume passes --resume instead of --session-id", () => {
  const { args } = claudeLaunch({ ...base, resume: true });
  expect(after(args, "--resume")).toBe(base.sessionId);
  expect(args).not.toContain("--session-id");
  expect(JSON.parse(after(args, "--settings")).hooks.Stop).toBeDefined();
});
