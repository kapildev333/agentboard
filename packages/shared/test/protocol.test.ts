import { expect, test } from "vitest";
import { parseClientMessage } from "@agentboard/shared";

test("parseClientMessage round-trips an input message and rejects an unknown t", () => {
  const msg = { t: "input", consoleId: "c1", data: "x" };
  expect(parseClientMessage(msg)).toEqual(msg);
  expect(() => parseClientMessage({ t: "nope" })).toThrow();
});
