import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@agentboard/daemon");
});

test.each([{}, { startDaemon: undefined }])("start exits 1 with one line when the daemon cannot be loaded (%o)", async (mod) => {
  vi.doMock("@agentboard/daemon", () => mod);
  vi.spyOn(process, "exit").mockImplementation(((c: number) => {
    throw new Error(`exit ${c}`);
  }) as never);
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const { startCommand } = await import("../src/commands/start.js");
  await expect(startCommand()).rejects.toThrow("exit 1");
  expect(err).toHaveBeenCalledTimes(1);
  expect(err.mock.calls[0]![0]).toMatch(/^agentboard: cannot load the daemon: [^\n]+$/);
});

test("start calls startDaemon with the cwd and prints the origin, never the token (L19)", async () => {
  const token = "secret-token-0123456789abcdef0123456789";
  const startDaemon = vi.fn(async () => ({ origin: "http://127.0.0.1:1", port: 1, token, close: async () => {} }));
  vi.doMock("@agentboard/daemon", () => ({ startDaemon }));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process, "once").mockImplementation(() => process);
  const { startCommand } = await import("../src/commands/start.js");
  await startCommand();
  expect(startDaemon).toHaveBeenCalledWith({ repoPath: process.cwd() });
  expect(log.mock.calls).toEqual([["http://127.0.0.1:1"]]);
});
