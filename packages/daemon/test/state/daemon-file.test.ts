import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
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

test("write tightens a stale 644 daemon file and a planted 644 tmp file", async () => {
  await writeFile(daemonFilePath(), "stale", { mode: 0o644 });
  await writeFile(`${daemonFilePath()}.tmp`, "stale", { mode: 0o644 });
  await new DaemonFile().write({ port: 1, token: "t", pid: 2 });
  expect((await stat(daemonFilePath())).mode & 0o777).toBe(0o600);
});

test("the daemon directory is created with mode 700", async () => {
  process.env.AGENTBOARD_HOME = join(home, "nested");
  await new DaemonFile().write({ port: 1, token: "t", pid: 2 });
  expect((await stat(join(home, "nested"))).mode & 0o777).toBe(0o700);
  await mkdir(home, { recursive: true });
});
