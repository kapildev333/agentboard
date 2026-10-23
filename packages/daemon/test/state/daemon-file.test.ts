import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { DaemonFile, daemonFilePath } from "../../src/state/index.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agentboard-"));
  process.env.AGENTBOARD_HOME = home;
});
afterEach(async () => {
  delete process.env.AGENTBOARD_HOME;
  await rm(home, { recursive: true, force: true });
});

test("the daemon file is mode 600", async () => {
  const file = new DaemonFile();
  expect(await file.read()).toBeNull();
  await file.write({ port: 4321, token: "t", pid: 99 });
  expect((await stat(daemonFilePath())).mode & 0o777).toBe(0o600);
  expect(await file.read()).toEqual({ port: 4321, token: "t", pid: 99 });
  await file.remove();
  expect(await file.read()).toBeNull();
});
