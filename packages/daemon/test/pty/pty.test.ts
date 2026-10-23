import { describe, expect, it } from "vitest";
import { PtyManager } from "../../src/pty/index.js";

const until = (read: () => string, needle: string, ms = 2000) =>
  new Promise<void>((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (read().includes(needle)) return resolve();
      if (Date.now() - t0 > ms) return reject(new Error(`timeout waiting for ${needle}; got ${JSON.stringify(read())}`));
      setTimeout(tick, 20);
    };
    tick();
  });

const sh = (m: PtyManager, id: string, cols = 80, rows = 24) =>
  m.spawn({ id, command: "/bin/sh", args: [], cwd: "/tmp", env: { PATH: process.env.PATH ?? "" }, cols, rows });

describe("PtyManager", () => {
  it("a spawned shell echoes what it is given", async () => {
    const m = new PtyManager();
    let out = "";
    sh(m, "a");
    m.onData("a", (d) => (out += d));
    m.write("a", "echo hi\n");
    await until(() => out, "hi");
    await m.kill("a");
  });

  it("resize changes stty size", async () => {
    const m = new PtyManager();
    let out = "";
    sh(m, "r");
    m.onData("r", (d) => (out += d));
    m.resize("r", 100, 30);
    m.write("r", "stty size\n");
    await until(() => out, "30 100");
    await m.kill("r");
  });

  it("kill ends the process", async () => {
    const m = new PtyManager();
    sh(m, "k");
    let code: number | undefined;
    m.onExit("k", (c) => (code = c));
    await m.kill("k");
    expect(code).toBeTypeOf("number");
    expect(m.list()).toEqual([]);
  });

  it("kill escalates to SIGKILL after 5 seconds when SIGHUP is ignored", async () => {
    let fire: (() => void) | undefined;
    let delay = 0;
    const m = new PtyManager({
      set: (fn, ms) => ((fire = fn), (delay = ms), 1),
      clear: () => {},
    });
    m.spawn({
      id: "s",
      command: "/bin/sh",
      args: ["-c", "trap '' HUP; echo ready; while :; do sleep 1; done"],
      cwd: "/tmp",
      env: { PATH: process.env.PATH ?? "" },
      cols: 80,
      rows: 24,
    });
    let out = "";
    let exited = false;
    m.onData("s", (d) => (out += d));
    m.onExit("s", () => (exited = true));
    await until(() => out, "ready");
    const done = m.kill("s");
    await new Promise((r) => setTimeout(r, 300));
    expect(exited).toBe(false);
    expect(delay).toBe(5000);
    fire!();
    await done;
    expect(exited).toBe(true);
  });
});
