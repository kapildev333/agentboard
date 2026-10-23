import { describe, expect, it } from "vitest";

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
    await expect.poll(() => out).toMatch(/^hello\r?$/m);
    ws.close();
    await srv.close();
  });
});

describe("pty-ws spike lifecycle", () => {
  const connect = async () => {
    const { startServer } = await import("./pty-ws.ts");
    const { WebSocket } = await import("ws");
    const srv = await startServer();
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    const o = { out: "" };
    ws.on("message", (d) => (o.out += d.toString()));
    await new Promise((r) => ws.once("open", r));
    return { srv, ws, o };
  };

  it("applies a resize message", async () => {
    const { srv, ws, o } = await connect();
    ws.send(JSON.stringify({ cols: 123, rows: 45 }));
    ws.send("stty size\n");
    await expect.poll(() => o.out).toMatch(/^45 123\r?$/m);
    ws.close();
    await srv.close();
  });

  it("kills the shell when the socket closes", async () => {
    const { srv, ws, o } = await connect();
    ws.send("echo pid=$$\n");
    await expect.poll(() => o.out).toMatch(/^pid=\d+/m);
    const pid = Number(/^pid=(\d+)/m.exec(o.out)![1]);
    ws.close();
    await expect.poll(() => { try { process.kill(pid, 0); return true; } catch { return false; } }).toBe(false);
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
