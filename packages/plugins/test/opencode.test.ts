import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHookPost, buildSpawnPost } from "../opencode/hook.js";

const env = { AGENTBOARD_URL: "http://127.0.0.1:4321", AGENTBOARD_CONSOLE_ID: "c1" };

describe("buildHookPost", () => {
  it("turns a session.idle event into a post to the daemon", () => {
    const event = { type: "session.idle", properties: { sessionID: "s1" } };
    expect(buildHookPost(env, event)).toEqual({
      url: "http://127.0.0.1:4321/hook/c1",
      headers: { "content-type": "application/json", "X-AgentBoard-Token": "" },
      body: { agent: "opencode", event: "session.idle", payload: { sessionID: "s1" } },
    });
    expect(buildHookPost({}, event)).toBeNull();
  });
});

describe("AgentBoard plugin", () => {
  it("registers nothing without env and never throws when the daemon is down", async () => {
    const { AgentBoard } = await import("../opencode/agentboard.js");
    vi.stubEnv("AGENTBOARD_URL", "");
    vi.stubEnv("AGENTBOARD_CONSOLE_ID", "");
    const bare = await AgentBoard();
    expect(Object.keys(bare)).toEqual(["tool"]);

    vi.stubEnv("AGENTBOARD_URL", "http://127.0.0.1:1");
    vi.stubEnv("AGENTBOARD_CONSOLE_ID", "c1");
    const fetchMock = vi.fn().mockRejectedValue(new Error("refused"));
    vi.stubGlobal("fetch", fetchMock);
    const hooks = (await AgentBoard()) as Required<Awaited<ReturnType<typeof AgentBoard>>>;
    await hooks.event({ event: { type: "permission.asked", properties: { id: "p" } } });
    await hooks.event({ event: { type: "message.updated", properties: {} } });
    await hooks.event({ event: { type: "session.created", properties: { info: { id: "s1" } } } });
    await hooks["tool.execute.before"]({ tool: "bash" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("event posts carry the token header", async () => {
    vi.stubEnv("AGENTBOARD_URL", spawnEnv.AGENTBOARD_URL);
    vi.stubEnv("AGENTBOARD_CONSOLE_ID", spawnEnv.AGENTBOARD_CONSOLE_ID);
    vi.stubEnv("AGENTBOARD_TOKEN", spawnEnv.AGENTBOARD_TOKEN);
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { AgentBoard } = await import("../opencode/agentboard.js");
    const hooks = (await AgentBoard()) as unknown as { event(a: unknown): Promise<void> };
    await hooks.event({ event: { type: "session.idle", properties: {} } });
    expect(fetchMock.mock.calls[0][1].headers["X-AgentBoard-Token"]).toBe("tok");
    expect(buildHookPost(spawnEnv, { type: "x" })?.headers["X-AgentBoard-Token"]).toBe("tok");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});

const spawnEnv = { ...env, AGENTBOARD_TOKEN: "tok" };
const node = { id: "n7", type: "console", agent: "claude", cwd: "/tmp/x" };
const spawnTool = async () => {
  const { AgentBoard } = await import("../opencode/agentboard.js");
  const hooks = (await AgentBoard()) as { tool: { agentboard_spawn: { execute(a: unknown, c: unknown): Promise<string> } } };
  return hooks.tool.agentboard_spawn;
};

describe("agentboard_spawn", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const stub = (e: Record<string, string>) => Object.entries(e).forEach(([k, v]) => vi.stubEnv(k, v));

  it("posts the spawn request with the token and the caller console", async () => {
    stub(spawnEnv);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(node)));
    vi.stubGlobal("fetch", fetchMock);
    const out = await (await spawnTool()).execute({ agent: "claude", cwd: "/tmp/x" }, {});
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:4321/api/consoles");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers["X-AgentBoard-Token"]).toBe("tok");
    expect(JSON.parse(init.body)).toEqual({ agent: "claude", cwd: "/tmp/x", callerConsoleId: "c1" });
    expect(out).toContain("n7");
    expect(out).toContain("http://127.0.0.1:4321");
  });

  it("answers not running without AGENTBOARD_URL and sends nothing", async () => {
    stub({ AGENTBOARD_URL: "", AGENTBOARD_CONSOLE_ID: "c1" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await (await spawnTool()).execute({ agent: "claude", cwd: "/x" }, {})).toBe("AgentBoard is not running");
    expect(buildSpawnPost({}, { agent: "claude", cwd: "/x" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed spawn request returns one line and does not throw", async () => {
    stub(spawnEnv);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("refused")));
    const tool = await spawnTool();
    expect(await tool.execute({ agent: "claude", cwd: "/x" }, {})).toBe("AgentBoard is not running");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(node), { status: 401 })));
    expect(await tool.execute({ agent: "claude", cwd: "/x" }, {})).toBe("AgentBoard is not running");
  });
});
