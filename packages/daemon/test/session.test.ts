import { expect, test } from "vitest";
import { acceptHook, sessionFromHook } from "../src/session.js";

test("a hook whose payload.session_id differs from the console's session is dropped (D34)", () => {
  const node = { session: { provider: "claude" as const, id: "s1" } };
  expect(acceptHook(node, { session_id: "s1" })).toBe(true);
  expect(acceptHook(node, { session_id: "nested" })).toBe(false);
  expect(acceptHook(node, {})).toBe(true);
  expect(acceptHook({}, { session_id: "any" })).toBe(true);
});

test("the resume id is read from each agent's hook payload (L14)", () => {
  expect(sessionFromHook("codex", "agent-turn-complete", { "thread-id": "t-1" })).toBe("t-1");
  expect(sessionFromHook("gemini", "AfterAgent", { session_id: "g-1" })).toBe("g-1");
  expect(sessionFromHook("opencode", "session.created", { info: { id: "ses_1" } })).toBe("ses_1");
  expect(sessionFromHook("opencode", "session.idle", { sessionID: "ses_1" })).toBeUndefined();
  // claude's id is chosen at spawn with --session-id; custom agents cannot resume
  expect(sessionFromHook("claude", "Stop", { session_id: "c-1" })).toBeUndefined();
  expect(sessionFromHook("custom", "x", { session_id: "x" })).toBeUndefined();
  expect(sessionFromHook("codex", "agent-turn-complete", "not an object")).toBeUndefined();
});
