import { describe, expect, it } from "vitest";
import * as pty from "node-pty";

describe("pty spike", () => {
  it("a shell spawned through node-pty echoes", async () => {
    const p = pty.spawn("/bin/sh", ["-c", "echo hi"], { cols: 80, rows: 24 });
    let out = "";
    p.onData((d) => (out += d));
    await new Promise<void>((r) => p.onExit(() => r()));
    expect(out).toContain("hi");
  });
});
