import { expect, test } from "vitest";
import { parseClientMessage } from "@agentboard/shared";

test("parseClientMessage round-trips an input message and rejects an unknown t", () => {
  const msg = { t: "input", consoleId: "c1", data: "x" };
  expect(parseClientMessage(msg)).toEqual(msg);
  expect(() => parseClientMessage({ t: "nope" })).toThrow();
});

test("every message type parses and a bad field is rejected", async () => {
  const { parseDaemonMessage } = await import("@agentboard/shared");
  for (const m of [{ t: "attach", consoleId: "c1" }, { t: "resize", consoleId: "c1", cols: 80, rows: 24 }]) {
    expect(parseClientMessage(m)).toEqual(m);
  }
  const board = { version: 1, repoPath: "/r", activeWorkspaceId: "w", workspaces: [] };
  for (const m of [
    { t: "output", consoleId: "c1", data: "hi" },
    { t: "status", consoleId: "c1", status: "needs_you" },
    { t: "exit", consoleId: "c1", code: 0 },
    { t: "board", board },
  ]) {
    expect(parseDaemonMessage(m)).toEqual(m);
  }
  expect(() => parseClientMessage({ t: "resize", consoleId: "c1", cols: 0, rows: 24 })).toThrow();
  expect(() => parseDaemonMessage({ t: "status", consoleId: "c1", status: "busy" })).toThrow();
});
