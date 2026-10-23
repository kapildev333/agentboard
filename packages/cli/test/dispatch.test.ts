import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { main } from "../src/index.js";

beforeEach(() => {
  process.env.AGENTBOARD_HOME = mkdtempSync(join(tmpdir(), "ab-cli-"));
});
afterEach(() => {
  delete process.env.AGENTBOARD_HOME;
});

test("an unknown command prints usage and returns 2", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await main(["bogus"])).toBe(2);
  expect(err.mock.calls[0]![0]).toMatch(/^usage:/);
  err.mockRestore();
});

test("status with no daemon returns 1", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await main(["status"])).toBe(1);
  expect(log).toHaveBeenCalledWith('{"alive":false}');
  log.mockRestore();
});

test("open routes to the open command", async () => {
  await expect(main(["open", join(tmpdir(), "ab-missing-dir")])).rejects.toThrow(/not a directory/);
});
