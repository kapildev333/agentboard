import { expect, test } from "vitest";
import { CallLog, type Call } from "../src/integrations/index.js";

const call = (over: Partial<Call> = {}): Call => ({ route: "GET /api/status", status: 200, board: false, params: {}, ...over });

test("keeps the last 100 calls and drops the oldest", () => {
  const log = new CallLog();
  for (let i = 0; i < 105; i++) log.record(call({ route: `GET /api/n${i}` }));
  const { log: entries } = log.read();
  expect(entries).toHaveLength(100);
  // Newest first.
  expect(entries[0]!.route).toBe("GET /api/n104");
  expect(entries[99]!.route).toBe("GET /api/n5");
});

test("names the caller by its header, the hook's console, or the board's proof", () => {
  const consoles: Record<string, { title: string; agent: string }> = { c1: { title: "Checkout flow", agent: "claude" }, c2: { title: "OpenCode", agent: "opencode" } };
  const log = new CallLog((id) => consoles[id]);
  log.record(call({ client: "cli", route: "POST /api/consoles" }));
  log.record(call({ client: "mcp" }));
  log.record(call({ route: "POST /hook/:consoleId", params: { consoleId: "c1" } }));
  log.record(call({ route: "POST /hook/:consoleId", params: { consoleId: "c2" } }));
  log.record(call({ client: "opencode-plugin", route: "POST /api/consoles" }));
  log.record(call({ client: "claude-plugin", route: "POST /hook/:consoleId", params: { consoleId: "c1" } }));
  log.record(call({ client: "7f1c0b2e-uuid-of-a-tab", board: true }));
  log.record(call({ client: "anything else" }));
  expect(log.read().log.map((e) => e.source).reverse()).toEqual(["cli", "mcp", "Checkout flow", "OpenCode", "plugin", "Checkout flow", "board", "unknown"]);
});

test("seen holds the last accepted call per integration", () => {
  const log = new CallLog((id) => (id === "c2" ? { title: "OpenCode", agent: "opencode" } : { title: "Claude", agent: "claude" }));
  expect(log.read().seen).toEqual({});
  log.record(call({ client: "cli" }));
  log.record(call({ client: "mcp", status: 401, reason: "bad token" }));
  log.record(call({ route: "POST /hook/:consoleId", params: { consoleId: "c2" } }));
  log.record(call({ route: "POST /hook/:consoleId", params: { consoleId: "c1" } }));
  const { seen, log: entries } = log.read();
  // A refused MCP call is not a working one, and a board-launched claude's hook is the relay, not the plugin.
  expect(Object.keys(seen).sort()).toEqual(["command", "opencodePlugin"]);
  expect(seen.command).toBe(entries[3]!.at);
  log.record(call({ client: "claude-plugin", route: "POST /hook/:consoleId", params: { consoleId: "c1" } }));
  expect(log.read().seen.claudePlugin).toBeDefined();
});
