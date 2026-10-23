import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readDaemonInfo } from "../src/client.js";

test("the client reads daemon.json from AGENTBOARD_HOME", () => {
  const home = mkdtempSync(join(tmpdir(), "ab-"));
  writeFileSync(join(home, "daemon.json"), JSON.stringify({ port: 5123, token: "t", pid: 7 }));
  expect(readDaemonInfo({ AGENTBOARD_HOME: home })).toEqual({ port: 5123, token: "t", pid: 7 });
});
