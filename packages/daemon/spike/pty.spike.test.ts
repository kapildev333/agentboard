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

describe("pty-ws spike", () => {
  it("serves one connection end to end", async () => {
    const { startServer } = await import("./pty-ws.ts");
    const { WebSocket } = await import("ws");
    const srv = await startServer();
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    let out = "";
    ws.on("message", (d) => (out += d.toString()));
    await new Promise((r) => ws.once("open", r));
    ws.send("echo hello\n");
    await expect.poll(() => out.replace("echo hello", "")).toContain("hello");
    ws.close();
    await srv.close();
  });
});

describe("latency stats", () => {
  it("percentile picks nearest-rank values", async () => {
    const { percentile } = await import("./latency.ts");
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect([percentile(xs, 50), percentile(xs, 95), percentile(xs, 100)]).toEqual([50, 95, 100]);
  });
});
