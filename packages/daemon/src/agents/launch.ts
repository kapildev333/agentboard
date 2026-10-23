import type { AgentId } from "@agentboard/shared";
import type { CustomAgent } from "./catalog.js";
import { claudeLaunch } from "./claude/index.js";
import { codexLaunch, type Launch } from "./codex/index.js";
import { geminiLaunch } from "./gemini/index.js";
import { opencodeLaunch } from "./opencode/index.js";

export interface LaunchContext {
  consoleId: string;
  sessionId: string;
  daemonUrl: string;
  token: string;
  name: string;
  prompt?: string;
  /** Required when the agent is "custom". */
  custom?: CustomAgent;
}

function build(agent: AgentId, ctx: LaunchContext, resume: boolean): Launch {
  const { consoleId, daemonUrl, token, sessionId, name, prompt } = ctx;
  const input = { consoleId, daemonUrl, token, sessionId, resume };
  // `--` (claude, codex) and the `--flag=value` form (gemini and opencode, which parse with yargs and drop a
  // separate value that starts with a dash) keep a prompt that starts with a dash from being read as a flag.
  const withPrompt = (l: Launch, tail: string[]): Launch => (prompt && !resume ? { ...l, args: [...l.args, ...tail] } : l);
  switch (agent) {
    case "claude":
      return withPrompt(claudeLaunch({ ...input, name }), ["--", prompt ?? ""]);
    case "codex":
      return withPrompt(codexLaunch(input), ["--", prompt ?? ""]);
    case "gemini":
      return withPrompt(geminiLaunch(input), [`--prompt-interactive=${prompt}`]);
    case "opencode":
      return withPrompt(opencodeLaunch(input), [`--prompt=${prompt}`]);
    case "custom": {
      if (resume) throw new Error("a custom agent cannot resume");
      if (!ctx.custom) throw new Error("custom agent launch needs ctx.custom");
      return {
        command: ctx.custom.command,
        args: ctx.custom.args,
        env: { AGENTBOARD_URL: daemonUrl, AGENTBOARD_CONSOLE_ID: consoleId, AGENTBOARD_TOKEN: token, AGENTBOARD_AGENT: "custom" },
      };
    }
  }
}

export const launchArgs = (agent: AgentId, ctx: LaunchContext): Launch => build(agent, ctx, false);

// Codex and Gemini pick their own ids; the caller passes the one it captured. A custom agent has no resume.
export const resumeArgs = (agent: AgentId, sessionId: string, ctx: LaunchContext): Launch =>
  build(agent, { ...ctx, sessionId }, true);
