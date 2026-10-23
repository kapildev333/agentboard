// Spike: one node-pty shell per WebSocket. Frames in: raw text = input, JSON {cols,rows} = resize.
import { fileURLToPath } from "node:url";
import * as pty from "node-pty";
import { WebSocketServer } from "ws";

export async function startServer() {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((r) => wss.once("listening", r));
  wss.on("connection", (ws) => {
    const p = pty.spawn(process.env.SPIKE_SHELL ?? "/bin/sh", [], { cols: 80, rows: 24 });
    p.onData((d) => ws.send(d));
    p.onExit(() => ws.close());
    ws.on("message", (raw) => {
      const s = raw.toString();
      try {
        const m = JSON.parse(s);
        if (typeof m?.cols === "number" && typeof m?.rows === "number") return p.resize(m.cols, m.rows);
      } catch {
        // not JSON: plain input
      }
      p.write(s);
    });
    ws.on("close", () => p.kill());
  });
  const { port } = wss.address() as { port: number };
  return { port, close: () => new Promise<void>((r) => { wss.clients.forEach((c) => c.terminate()); wss.close(() => r()); }) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log((await startServer()).port);
}
