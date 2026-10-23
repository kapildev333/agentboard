import { describe, expect, it } from "vitest";
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
