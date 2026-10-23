import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@agentboard/daemon");
});

test("start exits 1 with one line when the daemon cannot be loaded", async () => {
  vi.doMock("@agentboard/daemon", () => ({}));
  vi.spyOn(process, "exit").mockImplementation(((c: number) => {
    throw new Error(`exit ${c}`);
  }) as never);
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const { startCommand } = await import("../src/commands/start.js");
  await expect(startCommand()).rejects.toThrow("exit 1");
  expect(err).toHaveBeenCalledTimes(1);
  expect(err.mock.calls[0]![0]).toMatch(/^agentboard: cannot load the daemon:/);
});

test("start calls startDaemon with the cwd and prints the URL", async () => {
  const startDaemon = vi.fn(async () => "http://127.0.0.1:1/");
  vi.doMock("@agentboard/daemon", () => ({ startDaemon }));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const { startCommand } = await import("../src/commands/start.js");
  await startCommand();
  expect(startDaemon).toHaveBeenCalledWith({ repoPath: process.cwd() });
  expect(log).toHaveBeenCalledWith("http://127.0.0.1:1/");
});
