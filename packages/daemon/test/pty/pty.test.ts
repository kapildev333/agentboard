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
});
