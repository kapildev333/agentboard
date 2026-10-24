import { expect, test } from "vitest";
import { nextRun, parseCron } from "../../src/loops/cron.js";

test("0 2 * * * after 2026-10-24T03:00 local is 2026-10-25T02:00", () => {
  expect(nextRun(parseCron("0 2 * * *"), new Date(2026, 9, 24, 3, 0))).toEqual(new Date(2026, 9, 25, 2, 0));
});

test("*/15 and 1-5 parse and an unknown token throws", () => {
  const spec = parseCron("*/15 9 * * 1-5");
  // Saturday 2026-10-24 09:20: the next weekday slot is Monday 09:00
  expect(nextRun(spec, new Date(2026, 9, 24, 9, 20))).toEqual(new Date(2026, 9, 26, 9, 0));
  expect(nextRun(spec, new Date(2026, 9, 26, 9, 0))).toEqual(new Date(2026, 9, 26, 9, 15));
  expect(nextRun(parseCron("1-30/10,45 * * * *"), new Date(2026, 9, 24, 9, 31))).toEqual(new Date(2026, 9, 24, 9, 45));
  expect(() => nextRun(parseCron("0 0 31 2 *"), new Date(2026, 9, 24))).toThrow();
  for (const bad of ["@daily", "* * * *", "61 * * * *", "*/0 * * * *", "x * * * *", "5-1 * * * *"]) expect(() => parseCron(bad)).toThrow();
});
