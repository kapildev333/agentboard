import { WebSocketServer } from "ws";

// Answers every message with the same bytes. Resolves once listening.
export function startEcho(port = 0) {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port, host: "127.0.0.1" }, () =>
      resolve({ port: wss.address().port, close: () => wss.close() }),
    );
    wss.on("connection", (ws) => ws.on("message", (data, isBinary) => ws.send(data, { binary: isBinary })));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await startEcho(Number(process.env.PORT ?? 0));
  console.log(`echo ws://127.0.0.1:${port}`);
}
