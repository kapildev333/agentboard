import { expect, test, vi } from "vitest";
import { main } from "../src/index.js";

test("an unknown command prints usage and returns 2", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await main(["bogus"])).toBe(2);
  expect(err.mock.calls[0]![0]).toMatch(/^usage:/);
  err.mockRestore();
});
