import { describe, expect, it } from "vitest";
import { loginEnv, parseEnv, PtyManager } from "../../src/pty/index.js";

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
    m.write("a", "echo $((6*7))\n");
    await until(() => out, "42");
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

  it("spawn refuses an id that is already in use", async () => {
    const m = new PtyManager();
    sh(m, "d");
    expect(() => sh(m, "d")).toThrow(/already/);
    await m.kill("d");
  });

  it("resize and onExit are safe after the process exited by itself", async () => {
    const m = new PtyManager();
    sh(m, "x");
    let first: number | undefined;
    m.onExit("x", (c) => (first = c));
    m.write("x", "exit 3\n");
    await until(() => String(first ?? ""), "3");
    expect(() => m.resize("x", 90, 20)).not.toThrow();
    let late: number | undefined;
    m.onExit("x", (c) => (late = c));
    expect(late).toBe(3);
  });

  it("kill takes down children that ignore SIGHUP", async () => {
    let fire: (() => void) | undefined;
    const m = new PtyManager({ set: (fn) => ((fire = fn), 1), clear: () => {} });
    m.spawn({
      id: "g",
      command: "/bin/sh",
      args: ["-c", "trap '' HUP; (trap '' HUP; while :; do sleep 1; done) & echo child=$!; wait"],
      cwd: "/tmp",
      env: { PATH: process.env.PATH ?? "" },
      cols: 80,
      rows: 24,
    });
    let out = "";
    m.onData("g", (d) => (out += d));
    await until(() => out, "child=");
    const child = Number(/child=(\d+)/.exec(out)![1]);
    const done = m.kill("g");
    await new Promise((r) => setTimeout(r, 200));
    fire!();
    await done;
    await new Promise((r) => setTimeout(r, 200));
    expect(() => process.kill(child, 0)).toThrow();
  });

  it("replay returns the buffered output to a late attacher", async () => {
    const m = new PtyManager();
    let out = "";
    sh(m, "p");
    m.onData("p", (d) => (out += d));
    m.write("p", "echo first\n");
    await until(() => out, "first");
    expect(m.replay("p")).toContain("first");
    m.write("p", "seq 1 100000; echo E$((1))ND\n");
    await until(() => out, "E1ND");
    expect(out.length).toBeGreaterThan(400 * 1024);
    expect(m.replay("p")).toBe(out.slice(-200 * 1024));
    await m.kill("p");
  });
});

describe("loginEnv", () => {
  it("loginEnv contains PATH", async () => {
    const vars = await loginEnv();
    expect(vars.PATH).toBeTruthy();
    expect(await loginEnv()).toBe(vars);
  });
});

describe("parseEnv", () => {
  it("splits NUL-separated entries at the first = and keeps odd names and values intact", () => {
    const text = "A=1\0B=x\ny=z\0BASH_FUNC_f%%=() { :\n}\0C=a=b\0";
    expect(parseEnv(text)).toEqual({ A: "1", B: "x\ny=z", "BASH_FUNC_f%%": "() { :\n}", C: "a=b" });
  });

  it("skips entries with no usable name", () => {
    expect(parseEnv("motd line\0A=1\0")).toEqual({ A: "1" });
  });

  it("keeps the first variable when an rc file printed something before it", () => {
    expect(parseEnv("motd\nPATH=/x\0")).toEqual({ PATH: "/x" });
  });
});
