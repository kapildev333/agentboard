import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { launchArgs, resumeArgs, type LaunchContext } from "../../src/agents/index.js";

const ctx: LaunchContext = {
  consoleId: "c1",
  sessionId: "8f0e2a52-4c1b-4b0e-9f3a-2d7c1e5b6a90",
  daemonUrl: "http://127.0.0.1:4321",
  token: "t0k",
  name: "api worker",
  cwd: "/work/repo",
};
const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

test("launchArgs for claude carries the hooks, session id and name", () => {
  const { command, args, env } = launchArgs("claude", ctx);
  expect(command).toBe("claude");
  expect(after(args, "--session-id")).toBe(ctx.sessionId);
  expect(after(args, "--name")).toBe("api worker");
  expect(Object.keys(JSON.parse(after(args, "--settings")).hooks)).toContain("Stop");
  expect(env.AGENTBOARD_AGENT).toBe("claude");
});

test("launchArgs for opencode sets the plugin environment", () => {
  const { command, args, env } = launchArgs("opencode", ctx);
  expect(command).toBe("opencode");
  expect(args).toEqual([]);
  expect(env).toMatchObject({
    AGENTBOARD_URL: ctx.daemonUrl,
    AGENTBOARD_CONSOLE_ID: "c1",
    AGENTBOARD_AGENT: "opencode",
  });
  const plugin = pathToFileURL(join(homedir(), ".agentboard/plugins/opencode/agentboard.ts")).href;
  expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT)).toEqual({ plugin: [plugin] });
});

test.each([
  ["claude", "--resume", ctx.sessionId],
  ["codex", "resume", ctx.sessionId],
  ["gemini", "--resume", ctx.sessionId],
  ["opencode", "--session", ctx.sessionId],
] as const)("resumeArgs per agent: %s", (agent, flag, id) => {
  const { args, env } = resumeArgs(agent, id, ctx);
  expect(after(args, flag)).toBe(id);
  expect(env.AGENTBOARD_AGENT).toBe(agent);
  if (agent === "claude") expect(args).not.toContain("--session-id");
});

test("a prompt is passed on launch for each agent", () => {
  const p = { ...ctx, prompt: "fix it" };
  expect(launchArgs("claude", p).args.slice(-2)).toEqual(["--", "fix it"]);
  expect(launchArgs("codex", p).args.slice(-2)).toEqual(["--", "fix it"]);
  expect(after(launchArgs("gemini", p).args, "--prompt-interactive")).toBe("fix it");
  expect(after(launchArgs("opencode", p).args, "--prompt")).toBe("fix it");
});

test("a custom agent runs its configured command", () => {
  const custom = { id: "t", name: "T", command: "mytool", args: ["--fast"] };
  const { command, args, env } = launchArgs("custom", { ...ctx, custom });
  expect(command).toBe("mytool");
  expect(args).toEqual(["--fast"]);
  expect(env).toMatchObject({ AGENTBOARD_AGENT: "custom", AGENTBOARD_CONSOLE_ID: "c1", AGENTBOARD_URL: ctx.daemonUrl });
  expect(resumeArgs("custom", "x", { ...ctx, custom }).args).toEqual(["--fast"]);
});

test("launchArgs for a custom agent without a configured command throws", () => {
  expect(() => launchArgs("custom", ctx)).toThrow(/custom/);
});
