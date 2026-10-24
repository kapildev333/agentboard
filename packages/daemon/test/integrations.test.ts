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
