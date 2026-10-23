import { describe, expect, it, vi } from "vitest";
import { buildHookPost } from "../opencode/agentboard";

const env = { AGENTBOARD_URL: "http://127.0.0.1:4321", AGENTBOARD_CONSOLE_ID: "c1" };

describe("buildHookPost", () => {
  it("turns a session.idle event into a post to the daemon", () => {
    const event = { type: "session.idle", properties: { sessionID: "s1" } };
    expect(buildHookPost(env, event)).toEqual({
      url: "http://127.0.0.1:4321/hook/c1",
      body: { agent: "opencode", event: "session.idle", payload: { sessionID: "s1" } },
    });
    expect(buildHookPost({}, event)).toBeNull();
  });
});

describe("AgentBoard plugin", () => {
  it("registers nothing without env and never throws when the daemon is down", async () => {
    const { AgentBoard } = await import("../opencode/agentboard");
    vi.stubEnv("AGENTBOARD_URL", "");
    vi.stubEnv("AGENTBOARD_CONSOLE_ID", "");
    expect(await AgentBoard()).toEqual({});

    vi.stubEnv("AGENTBOARD_URL", "http://127.0.0.1:1");
    vi.stubEnv("AGENTBOARD_CONSOLE_ID", "c1");
    const fetchMock = vi.fn().mockRejectedValue(new Error("refused"));
    vi.stubGlobal("fetch", fetchMock);
    const hooks = (await AgentBoard()) as any;
    await hooks.event({ event: { type: "permission.asked", properties: { id: "p" } } });
    await hooks.event({ event: { type: "message.updated", properties: {} } });
    await hooks["tool.execute.before"]({ tool: "bash" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
