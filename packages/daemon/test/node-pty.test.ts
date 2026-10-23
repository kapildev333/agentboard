import { expect, test } from "vitest";
import { spawn } from "node-pty";

test("node-pty spawns /bin/sh and delivers output", async () => {
  const pty = spawn("/bin/sh", ["-c", "echo hi"], { cols: 80, rows: 24 });
  let out = "";
  pty.onData((d) => (out += d));
  await new Promise<void>((resolve) => pty.onExit(() => resolve()));
  expect(out).toContain("hi");
});
